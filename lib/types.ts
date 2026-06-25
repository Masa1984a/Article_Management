/**
 * 同期処理の共通型
 */

/** 同期処理のオプション（差分同期の挙動を制御） */
export interface SyncOptions {
  /** 1回の実行で本文(body)を取得する最大件数。本文NULLの記事のみが対象。 */
  maxBodyFetches?: number;
  /** 本文取得リクエスト間の待機時間(ms)。レート制限回避のため。 */
  bodyDelayMs?: number;
}

/** 同期結果サマリー（CLI / Vercel Cron 共通） */
export interface SyncResult {
  /** プラットフォーム識別子 */
  platform: "zenn" | "note";
  /** 一覧APIで取得した総記事数 */
  total: number;
  /** メタdata(いいね数等)のupsertに成功した件数 */
  synced: number;
  /** メタdataのupsertに失敗した件数 */
  errors: number;
  /** このrunで本文(body)を新規取得できた件数 */
  bodyFetched: number;
  /** まだ本文が未取得(NULL)で残っている件数 */
  bodyRemaining: number;
  /** レート制限により本文取得を途中で打ち切ったか */
  rateLimited: boolean;
}
