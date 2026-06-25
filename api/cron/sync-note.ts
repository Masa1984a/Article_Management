/**
 * Vercel Cron エンドポイント — note記事の日次同期
 *
 * vercel.json の crons 設定から日次でGETが送られる。
 * Vercelはcron実行時に Authorization: Bearer <CRON_SECRET> を自動付与するため、
 * CRON_SECRET が設定されている場合はそれを検証して外部からの不正実行を防ぐ。
 *
 * 必要な環境変数（Vercelのプロジェクト設定で登録）:
 *   DATABASE_URL  — Neonの接続文字列（Neon連携で自動注入が理想）
 *   NOTE_USERNAME — 任意（省略時 masa0416ab）
 *   CRON_SECRET   — cron認証用のシークレット
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { syncNote } from "../../lib/note";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- cron認証 ---
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const result = await syncNote();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("note sync failed:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
