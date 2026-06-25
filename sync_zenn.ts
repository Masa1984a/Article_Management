/**
 * Zenn記事同期スクリプト（CLIエントリ）
 *
 * 実処理は lib/zenn.ts の syncZenn() に切り出している。
 * このファイルはローカル実行用の薄いラッパー。
 *
 * 使い方:
 *   npm run sync:zenn
 *   npx tsx sync_zenn.ts
 */

import { syncZenn } from "./lib/zenn";

syncZenn()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 同期スクリプトが異常終了しました:", err);
    process.exit(1);
  });
