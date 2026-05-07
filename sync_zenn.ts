/**
 * Zenn記事同期スクリプト
 *
 * Zenn公開APIから記事一覧・詳細を取得し、Neon DBへupsertする。
 *
 * 使い方:
 *   npx tsx sync_zenn.ts
 *
 * 環境変数(.env):
 *   DATABASE_URL  — Neonの接続文字列 (postgresql://...)
 *   ZENN_USERNAME — Zennのユーザー名（デフォルト: myoshida2）
 */

import { sql } from "./db.js";

// ============================================
// 設定
// ============================================

const ZENN_USERNAME = process.env.ZENN_USERNAME ?? "myoshida2";

// Zenn APIのベースURL
const ZENN_API_BASE = "https://zenn.dev/api";

// APIリクエスト間の待機時間（ミリ秒）— 過度なリクエストを避けるため
const REQUEST_DELAY_MS = 500;

// ============================================
// 型定義
// ============================================

/** Zenn記事一覧APIのレスポンス内の記事 */
interface ZennArticleSummary {
  slug: string;
  title: string;
  emoji: string;
  published_at: string;
  liked_count: number;
  topics: { name: string }[];
  user: { username: string };
  path: string;
}

/** Zenn記事詳細APIのレスポンス内の記事 */
interface ZennArticleDetail {
  slug: string;
  title: string;
  emoji: string;
  published_at: string;
  liked_count: number;
  topics: { name: string }[];
  body_html: string;
  user: { username: string };
  path: string;
  cover_image_url?: string;
}

// ============================================
// ユーティリティ関数
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchZennApi<T>(path: string): Promise<T> {
  const url = `${ZENN_API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Zenn API error: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json() as Promise<T>;
}

// ============================================
// メイン処理
// ============================================

async function main() {
  console.log(`🔄 Zenn記事同期を開始します (user: ${ZENN_USERNAME})`);

  // --- 1. 記事一覧を全ページ取得 ---
  const allArticles: ZennArticleSummary[] = [];
  let page = 1;

  while (true) {
    console.log(`  📄 記事一覧を取得中... (page ${page})`);
    const data = await fetchZennApi<{
      articles: ZennArticleSummary[];
      next_page: number | null;
    }>(`/articles?username=${ZENN_USERNAME}&order=latest&page=${page}`);

    allArticles.push(...data.articles);

    if (!data.next_page) break;
    page = data.next_page;
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
      console.log(`  📝 詳細取得中: ${article.slug}`);
      const detail = await fetchZennApi<{ article: ZennArticleDetail }>(
        `/articles/${article.slug}`
      );
      const a = detail.article;

      const topicNames = (a.topics ?? []).map((t) => t.name);
      const articleUrl = `https://zenn.dev${a.path ?? `/${ZENN_USERNAME}/articles/${a.slug}`}`;
      const syncedAt = new Date().toISOString();

      // INSERT ... ON CONFLICT (slug) DO UPDATE
      // topics は JSONB なので JSON.stringify で渡す
      await sql`
        INSERT INTO zenn_articles
          (slug, title, body_html, cover_image_url, liked_count, topics, published_at, synced_at, article_url, emoji)
        VALUES
          (${a.slug}, ${a.title}, ${a.body_html}, ${a.cover_image_url ?? null},
           ${a.liked_count}, ${JSON.stringify(topicNames)}::jsonb,
           ${a.published_at}, ${syncedAt}, ${articleUrl}, ${a.emoji})
        ON CONFLICT (slug) DO UPDATE SET
          title           = EXCLUDED.title,
          body_html       = EXCLUDED.body_html,
          cover_image_url = EXCLUDED.cover_image_url,
          liked_count     = EXCLUDED.liked_count,
          topics          = EXCLUDED.topics,
          published_at    = EXCLUDED.published_at,
          synced_at       = EXCLUDED.synced_at,
          article_url     = EXCLUDED.article_url,
          emoji           = EXCLUDED.emoji
      `;

      syncedCount++;
    } catch (err) {
      console.error(
        `  ⚠️  エラー [${article.slug}]:`,
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
