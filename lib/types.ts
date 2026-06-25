/**
 * 同期処理の共通型
 */

/** 同期結果サマリー（CLI / Vercel Cron 共通） */
export interface SyncResult {
  /** プラットフォーム識別子 */
  platform: "zenn" | "note";
  /** 取得した記事の合計件数 */
  total: number;
  /** upsert に成功した件数 */
  synced: number;
  /** エラーになった件数 */
  errors: number;
}
