/**
 * note記事同期ロジック（CLI / Vercel Cron 共通） — 差分同期版
 *
 * 構成は lib/zenn.ts と同じ:
 *   Phase A: 一覧API(v2)から like_count 等メタdataを全件upsert（本文は触らない）
 *   Phase B: body が NULL の記事だけ、件数上限つき・1件ずつ緩やかに本文(v3)取得。
 *            429に当たったら即中断し、残りは次回のrunに繰り越す。
 *
 * note APIは非公式のため、Zennより控えめ寄りの設定にしている。
 *
 * 環境変数:
 *   DATABASE_URL  — Neonの接続文字列
 *   NOTE_USERNAME — noteのユーザー名（デフォルト: masa0416ab）
 */

import { sql } from "../db";
import type { SyncOptions, SyncResult } from "./types";
import { fetchJson, HttpError, mapWithConcurrency, sleep } from "./util";

// ============================================
// 設定
// ============================================

const NOTE_USERNAME = process.env.NOTE_USERNAME ?? "masa0416ab";
const NOTE_API_BASE = "https://note.com/api/v2";
const NOTE_API_V3_BASE = "https://note.com/api/v3";

const META_CONCURRENCY = 5;
const LIST_DELAY_MS = 400;
const DEFAULT_MAX_BODY = 25;
const DEFAULT_BODY_DELAY_MS = 1000;

// ============================================
// 型定義
// ============================================

interface NoteArticleSummary {
  key: string;
  name: string;
  likeCount: number;
  publishAt: string;
  eyecatch: string | null;
  noteUrl: string;
}

interface NoteArticleDetail {
  key: string;
  name: string;
  body: string | null;
  like_count: number;
  publish_at: string;
  eyecatch: string | null;
  hashtag_notes: { hashtag: { name: string } }[];
  is_limited: boolean;
  note_url: string;
}

interface NoteListApiResponse {
  data: { contents: NoteArticleSummary[]; isLastPage: boolean };
}
interface NoteDetailApiResponse {
  data: NoteArticleDetail;
}

// ============================================
// API ヘルパー
// ============================================

function fetchNoteApi<T>(url: string): Promise<T> {
  return fetchJson<T>(url, { label: "note API" });
}

/** 本文取得。429なら即throwして呼び出し側で中断させる */
function fetchNoteDetail(key: string): Promise<NoteDetailApiResponse> {
  return fetchJson<NoteDetailApiResponse>(`${NOTE_API_V3_BASE}/notes/${key}`, {
    label: "note API",
    retries: 0,
  });
}

// ============================================
// メイン処理
// ============================================

export async function syncNote(opts: SyncOptions = {}): Promise<SyncResult> {
  const maxBody = opts.maxBodyFetches ?? DEFAULT_MAX_BODY;
  const bodyDelayMs = opts.bodyDelayMs ?? DEFAULT_BODY_DELAY_MS;

  console.log(`🔄 note差分同期を開始 (user: ${NOTE_USERNAME}, maxBody: ${maxBody})`);

  // --- Phase A: 一覧を全ページ取得し、メタdataを全件upsert ---
  const allArticles: NoteArticleSummary[] = [];
  let page = 1;
  while (true) {
    console.log(`  📄 一覧取得... (page ${page})`);
    const data = await fetchNoteApi<NoteListApiResponse>(
      `${NOTE_API_BASE}/creators/${NOTE_USERNAME}/contents?kind=note&page=${page}`
    );
    allArticles.push(...data.data.contents);
    if (data.data.isLastPage) break;
    page++;
    await sleep(LIST_DELAY_MS);
  }
  console.log(`  ✅ ${allArticles.length} 件の記事メタdataを取得`);

  let syncedCount = 0;
  let errorCount = 0;
  await mapWithConcurrency(allArticles, META_CONCURRENCY, async (a) => {
    try {
      const syncedAt = new Date().toISOString();
      // body / tags / is_paid は触らない（INSERT時はNULL/既定、UPDATE時は保持）
      await sql`
        INSERT INTO note_articles
          (key, title, cover_image_url, like_count, published_at, synced_at, url)
        VALUES
          (${a.key}, ${a.name}, ${a.eyecatch ?? null}, ${a.likeCount},
           ${a.publishAt}, ${syncedAt}, ${a.noteUrl})
        ON CONFLICT (key) DO UPDATE SET
          title           = EXCLUDED.title,
          cover_image_url = EXCLUDED.cover_image_url,
          like_count      = EXCLUDED.like_count,
          published_at    = EXCLUDED.published_at,
          synced_at       = EXCLUDED.synced_at,
          url             = EXCLUDED.url
      `;
      syncedCount++;
    } catch (err) {
      console.error(`  ⚠️ メタupsertエラー [${a.key}]:`, err instanceof Error ? err.message : err);
      errorCount++;
    }
  });
  console.log(`  ✅ メタdata upsert: 成功 ${syncedCount} / 失敗 ${errorCount}`);

  // --- Phase B: 本文(body)がNULLの記事だけ、上限つきで取得 ---
  const missing = (await sql`
    SELECT key FROM note_articles
    WHERE body IS NULL
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${maxBody}
  `) as { key: string }[];

  console.log(`  📝 本文未取得 ${missing.length} 件を取得します（上限 ${maxBody}）`);

  let bodyFetched = 0;
  let rateLimited = false;
  for (const { key } of missing) {
    try {
      const detail = await fetchNoteDetail(key);
      const a = detail.data;
      const tagNames = (a.hashtag_notes ?? []).map((h) => h.hashtag.name);
      await sql`
        UPDATE note_articles SET
          body            = ${a.body ?? null},
          cover_image_url = ${a.eyecatch ?? null},
          tags            = ${JSON.stringify(tagNames)}::jsonb,
          is_paid         = ${a.is_limited},
          synced_at       = ${new Date().toISOString()}
        WHERE key = ${key}
      `;
      bodyFetched++;
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        console.warn(`  ⏸️ noteにレート制限されたため本文取得を中断（残りは次回run）。`);
        rateLimited = true;
        break;
      }
      console.error(`  ⚠️ 本文取得エラー [${key}]:`, err instanceof Error ? err.message : err);
    }
    await sleep(bodyDelayMs);
  }

  const remainingRow = (await sql`
    SELECT count(*)::int AS c FROM note_articles WHERE body IS NULL
  `) as { c: number }[];
  const bodyRemaining = remainingRow[0]?.c ?? 0;

  // --- サマリー ---
  console.log("========================================");
  console.log(`✅ note同期完了`);
  console.log(`   メタ更新: ${syncedCount} 件 / 本文取得: ${bodyFetched} 件`);
  console.log(`   本文未取得の残り: ${bodyRemaining} 件${rateLimited ? "（レート制限で中断）" : ""}`);
  console.log("========================================");

  return {
    platform: "note",
    total: allArticles.length,
    synced: syncedCount,
    errors: errorCount,
    bodyFetched,
    bodyRemaining,
    rateLimited,
  };
}
