/**
 * Zenn記事同期スクリプト
 *
 * Zenn公開APIから記事一覧・詳細を取得し、Supabaseへupsertする。
 *
 * 使い方:
 *   npx tsx sync_zenn.ts
 *
 * 環境変数(.env):
 *   SUPABASE_URL      — SupabaseプロジェクトのURL
 *   SUPABASE_KEY       — Supabaseのservice_roleキー（またはanonキー）
 *   ZENN_USERNAME      — Zennのユーザー名（デフォルト: myoshida2）
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// ============================================
// 設定
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ZENN_USERNAME = process.env.ZENN_USERNAME ?? "myoshida2";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ 環境変数 SUPABASE_URL / SUPABASE_KEY が設定されていません");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

/** 指定ミリ秒だけ待機する */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Zenn APIへGETリクエストを送信する
 * レスポンスが正常でない場合はエラーをスロー
 */
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

    // 次のページがなければ終了
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
      // 記事詳細（本文）を取得
      console.log(`  📝 詳細取得中: ${article.slug}`);
      const detail = await fetchZennApi<{ article: ZennArticleDetail }>(
        `/articles/${article.slug}`
      );
      const a = detail.article;

      // トピック名の配列を作成
      const topicNames = (a.topics ?? []).map((t) => t.name);

      // 記事URLを組み立て
      const articleUrl = `https://zenn.dev${a.path ?? `/${ZENN_USERNAME}/articles/${a.slug}`}`;

      // Supabaseへupsert（slugをPKとして既存記事は更新）
      const { error } = await supabase.from("zenn_articles").upsert(
        {
          slug: a.slug,
          title: a.title,
          body_html: a.body_html,
          cover_image_url: a.cover_image_url ?? null,
          liked_count: a.liked_count,
          topics: topicNames,
          published_at: a.published_at,
          synced_at: new Date().toISOString(),
          article_url: articleUrl,
          emoji: a.emoji,
        },
        { onConflict: "slug" }
      );

      if (error) {
        console.error(`  ⚠️  upsert失敗 [${a.slug}]: ${error.message}`);
        errorCount++;
      } else {
        syncedCount++;
      }
    } catch (err) {
      console.error(
        `  ⚠️  エラー [${article.slug}]:`,
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
