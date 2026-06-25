/**
 * note記事同期スクリプト（CLIエントリ）
 *
 * 実処理は lib/note.ts の syncNote() に切り出している。
 * このファイルはローカル実行用の薄いラッパー。
 *
 * 使い方:
 *   npm run sync:note
 *   npx tsx sync_note.ts
 */

import { syncNote } from "./lib/note";

syncNote()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 同期スクリプトが異常終了しました:", err);
    process.exit(1);
  });
