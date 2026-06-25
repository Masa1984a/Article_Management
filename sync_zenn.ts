/**
 * Zenn記事同期スクリプト（CLIエントリ）
 *
 * 実処理は lib/zenn.ts の syncZenn() に切り出している。
 *
 * 使い方:
 *   npm run sync:zenn                       # 通常（本文は未取得ぶんを少しずつ）
 *   npx tsx sync_zenn.ts --max-body=1000    # 初回バックフィル（本文を多めに取得）
 *   npx tsx sync_zenn.ts --max-body=1000 --delay=1500   # さらに緩やかに
 *
 * 注意: Zennはレート制限が厳しいため、--max-body を大きくする初回バックフィルは
 *       --delay を 1000ms 以上にして緩やかに実行すること。429に当たっても
 *       自動で中断し、再実行すれば未取得ぶんの続きから埋まる。
 */

import { syncZenn } from "./lib/zenn";
import { parseSyncArgs } from "./lib/cli";

// CLIからのバックフィルでは既定の本文取得上限を大きめにする
syncZenn(parseSyncArgs({ defaultMaxBody: 1000 }))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 同期スクリプトが異常終了しました:", err);
    process.exit(1);
  });
