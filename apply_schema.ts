/**
 * schema.sql を Neon DB に適用するスクリプト
 *
 * Neon HTTPエンドポイント (@neondatabase/serverless の neon()) は
 * 1リクエストにつき単一文しか実行できないため、ここで文ごとに分割して順次実行する。
 *
 * 使い方:
 *   npx tsx apply_schema.ts
 */
import { sql } from "./db.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SQLテキストを文ごとに分割する。
 * - 行コメント `--` を除去
 * - $$ ... $$ や $tag$ ... $tag$ で囲まれたブロックの中のセミコロンは無視
 * - シングルクォート文字列内のセミコロンも無視
 */
function splitSql(text: string): string[] {
  const stmts: string[] = [];
  let buf = "";
  let i = 0;
  const n = text.length;

  // 状態フラグ
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let dollarTag: string | null = null; // 開始した $tag$ のtag名

  while (i < n) {
    const ch = text[i];
    const next2 = text.slice(i, i + 2);

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        buf += ch;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (next2 === "*/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingleQuote) {
      buf += ch;
      // エスケープされたクォート '' は単一引用符として扱う
      if (ch === "'" && text[i + 1] === "'") {
        buf += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'") inSingleQuote = false;
      i++;
      continue;
    }
    if (dollarTag !== null) {
      buf += ch;
      // 終了タグを探す
      const close = `$${dollarTag}$`;
      if (text.slice(i, i + close.length) === close) {
        buf += text.slice(i + 1, i + close.length);
        i += close.length;
        dollarTag = null;
        continue;
      }
      i++;
      continue;
    }

    // ここから通常状態
    if (next2 === "--") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (next2 === "/*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      buf += ch;
      i++;
      continue;
    }
    // $tag$ の検出（tagは [A-Za-z_][A-Za-z0-9_]* または空）
    if (ch === "$") {
      const m = text.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        dollarTag = m[1] ?? "";
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt.length > 0) stmts.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }

  const last = buf.trim();
  if (last.length > 0) stmts.push(last);
  return stmts;
}

async function main() {
  const schemaPath = join(process.cwd(), "schema.sql");
  const text = readFileSync(schemaPath, "utf-8");
  const statements = splitSql(text);

  console.log(`🔄 schema.sql を Neon に適用します (${statements.length} 文)`);

  let executed = 0;
  for (const stmt of statements) {
    const head = stmt.replace(/\s+/g, " ").slice(0, 80);
    process.stdout.write(`  [${executed + 1}/${statements.length}] ${head} ...`);
    try {
      // sql.query(textOnly) で生SQLを実行
      await sql.query(stmt);
      console.log(" ok");
      executed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ERROR\n     ${msg}`);
      throw err;
    }
  }

  console.log("\n========================================");
  console.log(`✅ ${executed} 文を適用完了`);
  console.log("========================================");
}

main().catch((err) => {
  console.error("❌ schema適用失敗:", err);
  process.exit(1);
});
