/**
 * Zenn記事同期ロジック（CLI / Vercel Cron 共通） — 差分同期版
 *
 * ZennはCloudflareで保護されており、詳細APIを短時間に大量に叩くと
 * 429（Retry-After 約1172秒）でブロックされる。そのため毎回全件の本文を
 * 取り直すのではなく、差分同期する:
 *
 *   Phase A: 一覧API(約6req)から liked_count 等のメタdataを全件upsert（本文は触らない）
 *   Phase B: body_html が NULL の記事だけ、件数上限つき・1件ずつ緩やかに本文取得。
 *            429に当たったら即中断し、残りは次回のrunに繰り越す。
 *
 * 環境変数:
 *   DATABASE_URL  — Neonの接続文字列
 *   ZENN_USERNAME — Zennのユーザー名（デフォルト: myoshida2）
 */

import { sql } from "../db";
import type { SyncOptions, SyncResult } from "./types";
import { fetchJson, HttpError, mapWithConcurrency, sleep } from "./util";

// ============================================
// 設定
// ============================================

const ZENN_USERNAME = process.env.ZENN_USERNAME ?? "myoshida2";
const ZENN_API_BASE = "https://zenn.dev/api";

// メタdata upsert（DBのみ）の同時実行数。外部APIを叩かないので並列でよい。
const META_CONCURRENCY = 5;

// 一覧ページ取得間の待機（Cloudflare対策で軽く間隔を空ける）
const LIST_DELAY_MS = 400;

// デフォルト（Vercel cron安全値）。CLIからは引数で上書きして初回バックフィルに使う。
const DEFAULT_MAX_BODY = 25;
const DEFAULT_BODY_DELAY_MS = 1000;

// ============================================
// 型定義
// ============================================

interface ZennArticleSummary {
  slug: string;
  title: string;
  emoji: string;
  published_at: string;
  liked_count: number;
  path: string;
}

interface ZennArticleDetail {
  slug: string;
  title: string;
  emoji: string;
  published_at: string;
  liked_count: number;
  topics: { name: string }[];
  body_html: string;
  path: string;
  cover_image_url?: string;
}

// ============================================
// API ヘルパー
// ============================================

/** 一覧など、軽くリトライしてよいリクエスト */
function fetchZennApi<T>(path: string): Promise<T> {
  return fetchJson<T>(`${ZENN_API_BASE}${path}`, { label: "Zenn API" });
}

/** 本文取得。429なら即throwして呼び出し側で中断させる（リトライしない） */
function fetchZennDetail(slug: string): Promise<{ article: ZennArticleDetail }> {
  return fetchJson<{ article: ZennArticleDetail }>(
    `${ZENN_API_BASE}/articles/${slug}`,
    { label: "Zenn API", retries: 0 }
  );
}

// ============================================
// メイン処理
// ============================================

export async function syncZenn(opts: SyncOptions = {}): Promise<SyncResult> {
  const maxBody = opts.maxBodyFetches ?? DEFAULT_MAX_BODY;
  const bodyDelayMs = opts.bodyDelayMs ?? DEFAULT_BODY_DELAY_MS;

  console.log(`🔄 Zenn差分同期を開始 (user: ${ZENN_USERNAME}, maxBody: ${maxBody})`);

  // --- Phase A: 一覧を全ページ取得し、メタdataを全件upsert ---
  const allArticles: ZennArticleSummary[] = [];
  let page = 1;
  while (true) {
    console.log(`  📄 一覧取得... (page ${page})`);
    const data = await fetchZennApi<{
      articles: ZennArticleSummary[];
      next_page: number | null;
    }>(`/articles?username=${ZENN_USERNAME}&order=latest&page=${page}`);
    allArticles.push(...data.articles);
    if (!data.next_page) break;
    page = data.next_page;
    await sleep(LIST_DELAY_MS);
  }
  console.log(`  ✅ ${allArticles.length} 件の記事メタdataを取得`);

  let syncedCount = 0;
  let errorCount = 0;
  await mapWithConcurrency(allArticles, META_CONCURRENCY, async (a) => {
    try {
      const articleUrl = `https://zenn.dev${a.path ?? `/${ZENN_USERNAME}/articles/${a.slug}`}`;
      const syncedAt = new Date().toISOString();
      // body_html / topics / cover_image_url は触らない（INSERT時はNULL/既定、UPDATE時は保持）
      await sql`
        INSERT INTO zenn_articles
          (slug, title, liked_count, published_at, synced_at, article_url, emoji)
        VALUES
          (${a.slug}, ${a.title}, ${a.liked_count}, ${a.published_at},
           ${syncedAt}, ${articleUrl}, ${a.emoji})
        ON CONFLICT (slug) DO UPDATE SET
          title        = EXCLUDED.title,
          liked_count  = EXCLUDED.liked_count,
          published_at = EXCLUDED.published_at,
          synced_at    = EXCLUDED.synced_at,
          article_url  = EXCLUDED.article_url,
          emoji        = EXCLUDED.emoji
      `;
      syncedCount++;
    } catch (err) {
      console.error(`  ⚠️ メタupsertエラー [${a.slug}]:`, err instanceof Error ? err.message : err);
      errorCount++;
    }
  });
  console.log(`  ✅ メタdata upsert: 成功 ${syncedCount} / 失敗 ${errorCount}`);

  // --- Phase B: 本文(body_html)がNULLの記事だけ、上限つきで取得 ---
  const missing = (await sql`
    SELECT slug FROM zenn_articles
    WHERE body_html IS NULL
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${maxBody}
  `) as { slug: string }[];

  console.log(`  📝 本文未取得 ${missing.length} 件を取得します（上限 ${maxBody}）`);

  let bodyFetched = 0;
  let rateLimited = false;
  for (const { slug } of missing) {
    try {
      const detail = await fetchZennDetail(slug);
      const a = detail.article;
      const topicNames = (a.topics ?? []).map((t) => t.name);
      await sql`
        UPDATE zenn_articles SET
          body_html       = ${a.body_html},
          cover_image_url = ${a.cover_image_url ?? null},
          topics          = ${JSON.stringify(topicNames)}::jsonb,
          synced_at       = ${new Date().toISOString()}
        WHERE slug = ${slug}
      `;
      bodyFetched++;
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        console.warn(`  ⏸️ Zennにレート制限されたため本文取得を中断（残りは次回run）。`);
        rateLimited = true;
        break;
      }
      console.error(`  ⚠️ 本文取得エラー [${slug}]:`, err instanceof Error ? err.message : err);
    }
    await sleep(bodyDelayMs);
  }

  const remainingRow = (await sql`
    SELECT count(*)::int AS c FROM zenn_articles WHERE body_html IS NULL
  `) as { c: number }[];
  const bodyRemaining = remainingRow[0]?.c ?? 0;

  // --- サマリー ---
  console.log("========================================");
  console.log(`✅ Zenn同期完了`);
  console.log(`   メタ更新: ${syncedCount} 件 / 本文取得: ${bodyFetched} 件`);
  console.log(`   本文未取得の残り: ${bodyRemaining} 件${rateLimited ? "（レート制限で中断）" : ""}`);
  console.log("========================================");

  return {
    platform: "zenn",
    total: allArticles.length,
    synced: syncedCount,
    errors: errorCount,
    bodyFetched,
    bodyRemaining,
    rateLimited,
  };
}
