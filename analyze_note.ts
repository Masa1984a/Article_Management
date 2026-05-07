/**
 * note記事の分析スクリプト
 *
 * Usage:
 *   npx tsx analyze_note.ts <command> [options]
 *
 * Commands:
 *   latest [N]            最新N件の記事を取得（デフォルト: 5）
 *   search <keyword>      タイトル・本文をキーワード検索
 *   stats                 記事全体の統計情報
 *   ranking [N]           スキ数ランキング（デフォルト: 10）
 *   tags [N]              タグ使用頻度ランキング（デフォルト: 10）
 *   article <key>         記事キーを指定して1件取得
 *
 * Options:
 *   --no-body             本文を出力しない（一覧表示向け）
 *   --tag <tag>           指定タグで絞り込み（例: --tag "#KAST"）
 */

import { sql } from "./db.js";

// ---- helpers ----

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || "latest";
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--no-body") {
      flags["noBody"] = true;
    } else if (args[i] === "--tag" && args[i + 1]) {
      flags["tag"] = args[++i];
    } else {
      positional.push(args[i]);
    }
  }
  return { command, positional, flags };
}

function printArticle(
  a: any,
  opts: { showBody?: boolean; rank?: number } = {}
) {
  const prefix = opts.rank != null ? `#${opts.rank} ` : "";
  console.log("=".repeat(80));
  console.log(`${prefix}TITLE: ${a.title}`);
  console.log(`URL: ${a.url}`);
  console.log(`PUBLISHED: ${a.published_at}`);
  console.log(`LIKES: ${a.like_count}`);
  console.log(`TAGS: ${JSON.stringify(a.tags)}`);
  if (a.is_paid != null) console.log(`IS_PAID: ${a.is_paid}`);
  if (a.body != null) console.log(`BODY LENGTH: ${a.body.length} chars`);
  if (opts.showBody && a.body) {
    console.log("-".repeat(80));
    console.log(a.body);
  }
  console.log();
}

// ---- commands ----

async function cmdLatest(n: number, showBody: boolean, tag?: string) {
  // tagはJSONB配列の包含検索: tags @> '["#KAST"]'::jsonb
  const rows = tag
    ? await sql`
        SELECT * FROM note_articles
        WHERE tags @> ${JSON.stringify([tag])}::jsonb
        ORDER BY published_at DESC
        LIMIT ${n}
      `
    : await sql`
        SELECT * FROM note_articles
        ORDER BY published_at DESC
        LIMIT ${n}
      `;

  console.log(`Latest ${rows.length} articles${tag ? ` (tag: ${tag})` : ""}:\n`);
  for (const a of rows) printArticle(a, { showBody });
}

async function cmdSearch(keyword: string, showBody: boolean, tag?: string) {
  const pat = `%${keyword}%`;
  const rows = tag
    ? await sql`
        SELECT * FROM note_articles
        WHERE (title ILIKE ${pat} OR body ILIKE ${pat})
          AND tags @> ${JSON.stringify([tag])}::jsonb
        ORDER BY published_at DESC
      `
    : await sql`
        SELECT * FROM note_articles
        WHERE title ILIKE ${pat} OR body ILIKE ${pat}
        ORDER BY published_at DESC
      `;

  console.log(
    `Search "${keyword}": ${rows.length} articles found${tag ? ` (tag: ${tag})` : ""}:\n`
  );
  for (const a of rows) printArticle(a, { showBody });
}

async function cmdStats() {
  const rows = await sql`SELECT * FROM note_articles`;

  const totalLikes = rows.reduce((s, a) => s + (a.like_count || 0), 0);
  const paid = rows.filter((a) => a.is_paid);
  const free = rows.filter((a) => !a.is_paid);

  // タグ集計
  const tagCount: Record<string, number> = {};
  for (const a of rows) {
    for (const t of a.tags || []) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  // 月別集計
  const monthly: Record<string, number> = {};
  for (const a of rows) {
    const m = a.published_at?.toISOString?.()?.slice(0, 7) ?? String(a.published_at)?.slice(0, 7);
    if (m) monthly[m] = (monthly[m] || 0) + 1;
  }

  console.log("=== note記事 統計情報 ===\n");
  console.log(`総記事数:     ${rows.length}`);
  console.log(`有料記事:     ${paid.length}`);
  console.log(`無料記事:     ${free.length}`);
  console.log(`合計スキ数:   ${totalLikes}`);
  console.log(
    `平均スキ数:   ${rows.length ? (totalLikes / rows.length).toFixed(1) : 0}`
  );
  console.log(`ユニークタグ数: ${Object.keys(tagCount).length}`);

  console.log("\n--- 月別投稿数 ---");
  for (const [m, c] of Object.entries(monthly).sort()) {
    console.log(`  ${m}: ${c}件`);
  }
}

async function cmdRanking(n: number, tag?: string) {
  const rows = tag
    ? await sql`
        SELECT title, url, like_count, published_at, tags
        FROM note_articles
        WHERE tags @> ${JSON.stringify([tag])}::jsonb
        ORDER BY like_count DESC
        LIMIT ${n}
      `
    : await sql`
        SELECT title, url, like_count, published_at, tags
        FROM note_articles
        ORDER BY like_count DESC
        LIMIT ${n}
      `;

  console.log(
    `スキ数ランキング TOP${rows.length}${tag ? ` (tag: ${tag})` : ""}:\n`
  );
  rows.forEach((a, i) => {
    const dateStr = a.published_at?.toISOString?.()?.slice(0, 10) ?? String(a.published_at)?.slice(0, 10);
    console.log(`  ${i + 1}. [${a.like_count} スキ] ${a.title}`);
    console.log(`     ${a.url}  (${dateStr})`);
  });
}

async function cmdTags(n: number) {
  const rows = await sql`SELECT tags FROM note_articles`;

  const tagCount: Record<string, number> = {};
  for (const a of rows) {
    for (const t of a.tags || []) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  const sorted = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

  console.log(`タグ使用頻度 TOP${sorted.length}:\n`);
  for (const [tag, count] of sorted) {
    console.log(`  ${tag}: ${count}件`);
  }
}

async function cmdArticle(key: string, showBody: boolean) {
  const rows = await sql`
    SELECT * FROM note_articles WHERE key = ${key} LIMIT 1
  `;
  if (rows.length === 0) {
    console.error(`Article not found: ${key}`);
    process.exit(1);
  }
  printArticle(rows[0], { showBody });
}

// ---- main ----

async function main() {
  const { command, positional, flags } = parseArgs();
  const showBody = !flags["noBody"];
  const tag = flags["tag"] as string | undefined;

  switch (command) {
    case "latest":
      await cmdLatest(parseInt(positional[0]) || 5, showBody, tag);
      break;
    case "search":
      if (!positional[0]) {
        console.error("Usage: analyze_note.ts search <keyword>");
        process.exit(1);
      }
      await cmdSearch(positional[0], showBody, tag);
      break;
    case "stats":
      await cmdStats();
      break;
    case "ranking":
      await cmdRanking(parseInt(positional[0]) || 10, tag);
      break;
    case "tags":
      await cmdTags(parseInt(positional[0]) || 10);
      break;
    case "article":
      if (!positional[0]) {
        console.error("Usage: analyze_note.ts article <key>");
        process.exit(1);
      }
      await cmdArticle(positional[0], showBody);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        "Available: latest, search, stats, ranking, tags, article"
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});
