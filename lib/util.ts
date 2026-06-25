/**
 * 同期処理の共通ユーティリティ（同時実行制御・リトライ付きfetch）
 */

/** HTTPステータス付きのエラー（429判定などに使う） */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** 指定ミリ秒待機する */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 配列を、同時実行数 `limit` を超えないように非同期処理する。
 * 各要素の処理 `fn` は自身でエラーを握りつぶす想定（1件の失敗で全体を止めない）。
 */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

/**
 * JSONを取得する。429/5xxは指数バックオフでリトライする。
 *
 * 重要: `Retry-After` ヘッダが巨大（CloudflareのZennは約1172秒を返す）でも
 * そのままsleepすると処理が数十分ハングするため、待機は `maxBackoffMs` で必ずキャップする。
 * リトライを使い切ったら `HttpError` を投げるので、呼び出し側で 429 を見て
 * 「本文取得を中断して次回に回す」といった制御ができる。
 *
 * @throws {HttpError} リトライ後も失敗した場合（status付き）
 */
export async function fetchJson<T>(
  url: string,
  opts: { retries?: number; label?: string; maxBackoffMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const label = opts.label ?? "API";
  const maxBackoffMs = opts.maxBackoffMs ?? 5000;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      // ネットワークエラーは数回までリトライ
      if (attempt < retries) {
        await sleep(Math.min(maxBackoffMs, 500 * 2 ** attempt));
        continue;
      }
      throw err;
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const retryAfterSec = Number(res.headers.get("retry-after"));
      const baseMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : 500 * 2 ** attempt;
      // 巨大なRetry-Afterは上限でキャップ（数十分sleepを防ぐ）
      await sleep(Math.min(maxBackoffMs, baseMs) + Math.random() * 200);
      continue;
    }

    throw new HttpError(
      res.status,
      `${label} error: ${res.status} ${res.statusText} (${url})`
    );
  }
}
