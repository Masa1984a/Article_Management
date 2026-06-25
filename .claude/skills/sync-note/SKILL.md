---
name: sync-note
description: note記事をNeon DBへ差分同期する。note非公式APIから一覧でメタdata(スキ数等)を全件更新し、本文未取得の記事だけ詳細を取得してupsertする。「note記事を同期」「note同期」「note記事を更新」「noteをsync」などのリクエストで使用する。また「全記事を同期」「すべて同期」のように全プラットフォーム同期を求められた場合にも使用する。
---

# note記事の差分同期

note非公式API（v2/v3）から取得する。レート制限に配慮し、Zennと同じ差分同期方式。

- **Phase A（毎回・全件・安い）**: 一覧API(v2)から `like_count`・タイトル等の
  メタdataを全件upsert。本文(body)は触らない。
- **Phase B（本文NULLのものだけ・上限つき）**: `body IS NULL` の記事だけ、
  1件ずつ緩やかに詳細API(v3)で本文取得。429に当たったら即中断し、残りは次回に繰り越す。

実処理は `lib/note.ts` の `syncNote()`。CLI・Vercel Cron の双方から呼ばれる。

## 実行手順

### note記事のみ同期する場合

```bash
npm run sync:note
```

### Zennも含めて全プラットフォームを一括同期する場合

```bash
npm run sync:all
```

### 初回バックフィル（本文を多めに取得したいとき）

```bash
npx tsx sync_note.ts --max-body=1000 --delay=1500
```

429で中断しても、再実行すれば未取得ぶんの続きから埋まる（冪等・再開可能）。

実行ログを監視し、完了後に以下をユーザーに報告する:
- メタ更新件数 / 本文取得件数 / 本文未取得の残り件数
- レート制限で中断した場合はその旨

## 自動化（Vercel Cron）

`vercel.json` の cron で毎日 `/api/cron/sync-note` が呼ばれ、`syncNote()` が実行される。

## 前提条件

- `npm install` 済みであること
- `.env` に `DATABASE_URL`（Neonの接続文字列）が設定されていること
- `.env` に `NOTE_USERNAME` が設定されていること（省略時: masa0416ab）
- Neon上に `note_articles` テーブルが作成済みであること（`npm run schema:apply` 実行済み）

## トラブルシューティング

- `note API error: 404` → note APIの仕様変更の可能性。`lib/note.ts` のエンドポイントを確認する
- `429` → レート制限。時間を置いて再実行（Phase Bは自動中断する）
- `relation "note_articles" does not exist` → `npm run schema:apply` でテーブル作成
- `DATABASE_URL が設定されていません` → `.env` を確認
