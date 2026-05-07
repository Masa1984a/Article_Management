/**
 * Neon DBクライアント共通ヘルパー
 *
 * 環境変数:
 *   DATABASE_URL — Neonの接続文字列 (postgresql://...)
 *
 * @neondatabase/serverless はHTTPS経由でクエリを実行するため、
 * PostgreSQLのTCPポート(5432等)がブロックされる環境でも動作する。
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import "dotenv/config";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ 環境変数 DATABASE_URL が設定されていません (.envを確認してください)");
  process.exit(1);
}

// sql`SELECT ...` テンプレートタグ
export const sql: NeonQueryFunction<false, false> = neon(DATABASE_URL);
