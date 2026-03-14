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

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const TABLE = "note_articles";

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
  let q = supabase
    .from(TABLE)
    .select("*")
    .order("published_at", { ascending: false })
    .limit(n);

  if (tag) q = q.contains("tags", [tag]);

  const { data, error } = await q;
  if (error) throw error;

  console.log(`Latest ${data!.length} articles${tag ? ` (tag: ${tag})` : ""}:\n`);
  for (const a of data!) printArticle(a, { showBody });
}

async function cmdSearch(keyword: string, showBody: boolean, tag?: string) {
  // タイトルと本文の両方を検索
  let qTitle = supabase
    .from(TABLE)
    .select("*")
    .ilike("title", `%${keyword}%`)
    .order("published_at", { ascending: false });

  let qBody = supabase
    .from(TABLE)
    .select("*")
    .ilike("body", `%${keyword}%`)
    .order("published_at", { ascending: false });

  if (tag) {
    qTitle = qTitle.contains("tags", [tag]);
    qBody = qBody.contains("tags", [tag]);
  }

  const [titleRes, bodyRes] = await Promise.all([qTitle, qBody]);
  if (titleRes.error) throw titleRes.error;
  if (bodyRes.error) throw bodyRes.error;

  // 重複排除（keyベース）
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const a of [...(titleRes.data || []), ...(bodyRes.data || [])]) {
    if (!seen.has(a.key)) {
      seen.add(a.key);
      merged.push(a);
    }
  }

  console.log(
    `Search "${keyword}": ${merged.length} articles found${tag ? ` (tag: ${tag})` : ""}:\n`
  );
  for (const a of merged) printArticle(a, { showBody });
}

async function cmdStats() {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw error;

  const articles = data!;
  const totalLikes = articles.reduce((s, a) => s + (a.like_count || 0), 0);
  const paid = articles.filter((a) => a.is_paid);
  const free = articles.filter((a) => !a.is_paid);

  // タグ集計
  const tagCount: Record<string, number> = {};
  for (const a of articles) {
    for (const t of a.tags || []) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  // 月別集計
  const monthly: Record<string, number> = {};
  for (const a of articles) {
    const m = a.published_at?.slice(0, 7); // YYYY-MM
    if (m) monthly[m] = (monthly[m] || 0) + 1;
  }

  console.log("=== note記事 統計情報 ===\n");
  console.log(`総記事数:     ${articles.length}`);
  console.log(`有料記事:     ${paid.length}`);
  console.log(`無料記事:     ${free.length}`);
  console.log(`合計スキ数:   ${totalLikes}`);
  console.log(
    `平均スキ数:   ${articles.length ? (totalLikes / articles.length).toFixed(1) : 0}`
  );
  console.log(`ユニークタグ数: ${Object.keys(tagCount).length}`);

  console.log("\n--- 月別投稿数 ---");
  for (const [m, c] of Object.entries(monthly).sort()) {
    console.log(`  ${m}: ${c}件`);
  }
}

async function cmdRanking(n: number, tag?: string) {
  let q = supabase
    .from(TABLE)
    .select("title, url, like_count, published_at, tags")
    .order("like_count", { ascending: false })
    .limit(n);

  if (tag) q = q.contains("tags", [tag]);

  const { data, error } = await q;
  if (error) throw error;

  console.log(
    `スキ数ランキング TOP${data!.length}${tag ? ` (tag: ${tag})` : ""}:\n`
  );
  data!.forEach((a, i) => {
    console.log(
      `  ${i + 1}. [${a.like_count} スキ] ${a.title}`
    );
    console.log(`     ${a.url}  (${a.published_at?.slice(0, 10)})`);
  });
}

async function cmdTags(n: number) {
  const { data, error } = await supabase.from(TABLE).select("tags");
  if (error) throw error;

  const tagCount: Record<string, number> = {};
  for (const a of data!) {
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
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("key", key)
    .single();
  if (error) throw error;

  printArticle(data, { showBody });
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
