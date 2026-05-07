/**
 * note記事同期スクリプト
 *
 * note非公式APIから記事一覧・詳細を取得し、Neon DBへupsertする。
 *
 * 使い方:
 *   npx tsx sync_note.ts
 *
 * 環境変数(.env):
 *   DATABASE_URL  — Neonの接続文字列 (postgresql://...)
 *   NOTE_USERNAME — noteのユーザー名（デフォルト: masa0416ab）
 */

import { sql } from "./db.js";

// ============================================
// 設定
// ============================================

const NOTE_USERNAME = process.env.NOTE_USERNAME ?? "masa0416ab";

// note APIのベースURL
const NOTE_API_BASE = "https://note.com/api/v2";
// note 記事詳細APIのベースURL（v3で本文全体を取得可能）
const NOTE_API_V3_BASE = "https://note.com/api/v3";

// APIリクエスト間の待機時間（ミリ秒）— 過度なリクエストを避けるため
const REQUEST_DELAY_MS = 500;

// ============================================
// 型定義
// ============================================

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

interface NoteListApiResponse {
  data: {
    contents: NoteArticleSummary[];
    isLastPage: boolean;
  };
}

interface NoteDetailApiResponse {
  data: NoteArticleDetail;
}

// ============================================
// ユーティリティ関数
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      console.log(`  📝 詳細取得中: ${article.key}`);
      const detail = await fetchNoteApi<NoteDetailApiResponse>(
        `${NOTE_API_V3_BASE}/notes/${article.key}`
      );
      const a = detail.data;

      const tagNames = (a.hashtag_notes ?? []).map((h) => h.hashtag.name);
      const syncedAt = new Date().toISOString();

      await sql`
        INSERT INTO note_articles
          (key, title, body, cover_image_url, like_count, tags, published_at, synced_at, url, is_paid)
        VALUES
          (${a.key}, ${a.name}, ${a.body ?? null}, ${a.eyecatch ?? null},
           ${a.like_count}, ${JSON.stringify(tagNames)}::jsonb,
           ${a.publish_at}, ${syncedAt}, ${a.note_url}, ${a.is_limited})
        ON CONFLICT (key) DO UPDATE SET
          title           = EXCLUDED.title,
          body            = EXCLUDED.body,
          cover_image_url = EXCLUDED.cover_image_url,
          like_count      = EXCLUDED.like_count,
          tags            = EXCLUDED.tags,
          published_at    = EXCLUDED.published_at,
          synced_at       = EXCLUDED.synced_at,
          url             = EXCLUDED.url,
          is_paid         = EXCLUDED.is_paid
      `;

      syncedCount++;
    } catch (err) {
      console.error(
        `  ⚠️  エラー [${article.key}]:`,
        err instanceof Error ? err.message : err
      );
      errorCount++;
    }

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

main().catch((err) => {
  console.error("❌ 同期スクリプトが異常終了しました:", err);
  process.exit(1);
});
