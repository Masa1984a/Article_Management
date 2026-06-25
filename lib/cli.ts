/**
 * CLI引数のパース（差分同期オプション）
 *
 * 対応引数:
 *   --max-body=<n>   1回で取得する本文の最大件数
 *   --delay=<ms>     本文取得リクエスト間の待機(ms)
 */

import type { SyncOptions } from "./types";

export function parseSyncArgs(defaults: { defaultMaxBody?: number } = {}): SyncOptions {
  const argv = process.argv.slice(2);
  const opts: SyncOptions = {};

  for (const arg of argv) {
    const [key, value] = arg.split("=");
    if (key === "--max-body" && value) opts.maxBodyFetches = Number(value);
    if (key === "--delay" && value) opts.bodyDelayMs = Number(value);
  }

  if (opts.maxBodyFetches === undefined && defaults.defaultMaxBody !== undefined) {
    opts.maxBodyFetches = defaults.defaultMaxBody;
  }
  return opts;
}
