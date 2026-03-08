/**
 * note記事同期スクリプト
 *
 * note非公式APIから記事一覧・詳細を取得し、Supabaseへupsertする。
 *
 * 使い方:
 *   npx tsx sync_note.ts
 *
 * 環境変数(.env):
 *   SUPABASE_URL      — SupabaseプロジェクトのURL
 *   SUPABASE_KEY       — Supabaseのservice_roleキー（またはanonキー）
 *   NOTE_USERNAME      — noteのユーザー名（デフォルト: masa0416ab）
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// ============================================
// 設定
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const NOTE_USERNAME = process.env.NOTE_USERNAME ?? "masa0416ab";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ 環境変数 SUPABASE_URL / SUPABASE_KEY が設定されていません");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// note APIのベースURL
const NOTE_API_BASE = "https://note.com/api/v2";
// note 記事詳細APIのベースURL（v3で本文全体を取得可能）
const NOTE_API_V3_BASE = "https://note.com/api/v3";

// APIリクエスト間の待機時間（ミリ秒）— 過度なリクエストを避けるため
const REQUEST_DELAY_MS = 500;

// ============================================
// 型定義
// ============================================

/** note記事一覧APIのレスポンス内の記事（本文はプレビューのみ） */
interface NoteArticleSummary {
  id: number;
  key: string;
  name: string;
  body: string | null;
  likeCount: number;
  publishAt: string;
  eyecatch: string | null;
  hashtags: { hashtag: { name: string } }[];
  isPaid: boolean;
  noteUrl: string;
}

/** note記事詳細APIのレスポンス内の記事（本文HTML全体を含む） */
interface NoteArticleDetail {
  id: number;
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

/** note記事一覧APIのレスポンス */
interface NoteListApiResponse {
  data: {
    contents: NoteArticleSummary[];
    isLastPage: boolean;
  };
}

/** note記事詳細APIのレスポンス */
interface NoteDetailApiResponse {
  data: NoteArticleDetail;
}

// ============================================
// ユーティリティ関数
// ============================================

/** 指定ミリ秒だけ待機する */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * note APIへGETリクエストを送信する
 * レスポンスが正常でない場合はエラーをスロー
 */
async function fetchNoteApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`note API error: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json() as Promise<T>;
}

// ============================================
// メイン処理
// ============================================

async function main() {
  console.log(`🔄 note記事同期を開始します (user: ${NOTE_USERNAME})`);

  // --- 1. 記事一覧を全ページ取得 ---
  const allArticles: NoteArticleSummary[] = [];
  let page = 1;

  while (true) {
    console.log(`  📄 記事一覧を取得中... (page ${page})`);
    const data = await fetchNoteApi<NoteListApiResponse>(
      `${NOTE_API_BASE}/creators/${NOTE_USERNAME}/contents?kind=note&page=${page}`
    );

    allArticles.push(...data.data.contents);

    // 最後のページなら終了
    if (data.data.isLastPage) break;
    page++;
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`  ✅ ${allArticles.length} 件の記事を取得しました`);

  if (allArticles.length === 0) {
    console.log("同期する記事がありません。終了します。");
    return;
  }

  // --- 2. 各記事の詳細を取得してupsert ---
  let syncedCount = 0;
  let errorCount = 0;

  for (const article of allArticles) {
    try {
      // 記事詳細（本文HTML全体）を取得
      console.log(`  📝 詳細取得中: ${article.key}`);
      const detail = await fetchNoteApi<NoteDetailApiResponse>(
        `${NOTE_API_V3_BASE}/notes/${article.key}`
      );
      const a = detail.data;

      // タグ名の配列を作成
      const tagNames = (a.hashtag_notes ?? []).map((h) => h.hashtag.name);

      // Supabaseへupsert（keyをPKとして既存記事は更新）
      const { error } = await supabase.from("note_articles").upsert(
        {
          key: a.key,
          title: a.name,
          body: a.body ?? null,
          cover_image_url: a.eyecatch ?? null,
          like_count: a.like_count,
          tags: tagNames,
          published_at: a.publish_at,
          synced_at: new Date().toISOString(),
          url: a.note_url,
          is_paid: a.is_limited,
        },
        { onConflict: "key" }
      );

      if (error) {
        console.error(`  ⚠️  upsert失敗 [${a.key}]: ${error.message}`);
        errorCount++;
      } else {
        syncedCount++;
      }
    } catch (err) {
      console.error(
        `  ⚠️  エラー [${article.key}]:`,
        err instanceof Error ? err.message : err
      );
      errorCount++;
    }

    // APIレート制限対策
    await sleep(REQUEST_DELAY_MS);
  }

  // --- 3. 結果サマリー ---
  console.log("\n========================================");
  console.log(`✅ 同期完了`);
  console.log(`   成功: ${syncedCount} 件`);
  if (errorCount > 0) {
    console.log(`   失敗: ${errorCount} 件`);
  }
  console.log(`   合計: ${allArticles.length} 件`);
  console.log("========================================");
}

// 実行
main().catch((err) => {
  console.error("❌ 同期スクリプトが異常終了しました:", err);
  process.exit(1);
});
