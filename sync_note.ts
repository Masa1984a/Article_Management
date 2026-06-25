/**
 * note記事同期スクリプト（CLIエントリ）
 *
 * 実処理は lib/note.ts の syncNote() に切り出している。
 *
 * 使い方:
 *   npm run sync:note                       # 通常（本文は未取得ぶんを少しずつ）
 *   npx tsx sync_note.ts --max-body=1000    # 初回バックフィル（本文を多めに取得）
 *   npx tsx sync_note.ts --max-body=1000 --delay=1500   # さらに緩やかに
 */

import { syncNote } from "./lib/note";
import { parseSyncArgs } from "./lib/cli";

// CLIからのバックフィルでは既定の本文取得上限を大きめにする
syncNote(parseSyncArgs({ defaultMaxBody: 1000 }))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 同期スクリプトが異常終了しました:", err);
    process.exit(1);
  });
