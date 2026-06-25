---
name: sync-zenn
description: Zenn記事をNeon DBへ差分同期する。Zenn公開APIから一覧でメタdata(いいね数等)を全件更新し、本文未取得の記事だけ詳細を取得してupsertする。「Zenn記事を同期」「Zenn同期」「記事を更新」「sync」などのリクエストで使用する。また「全記事を同期」「すべて同期」のように全プラットフォーム同期を求められた場合にも使用する。
---

# Zenn記事の差分同期

ZennはCloudflareでレート制限されている（429時の Retry-After が約1172秒）。
そのため毎回全件の本文を取り直さず、差分同期する。

- **Phase A（毎回・全件・安い）**: 一覧API（約6req）から `liked_count`・タイトル等の
  メタdataを全件upsert。本文(body_html)は触らない。
- **Phase B（本文NULLのものだけ・上限つき）**: `body_html IS NULL` の記事だけ、
  1件ずつ緩やかに詳細APIで本文取得。429に当たったら即中断し、残りは次回に繰り越す。

実処理は `lib/zenn.ts` の `syncZenn()`。CLI・Vercel Cron の双方から呼ばれる。

## 実行手順

### Zenn記事のみ同期する場合

```bash
npm run sync:zenn
```

### noteも含めて全プラットフォームを一括同期する場合

```bash
npm run sync:all
```

### 初回バックフィル（本文を多めに取得したいとき）

新しいアカウントや本文未取得が多数あるときのみ。レート制限が厳しいので緩やかに。

```bash
npx tsx sync_zenn.ts --max-body=1000 --delay=1500
```

429で中断しても、再実行すれば未取得ぶんの続きから埋まる（冪等・再開可能）。

実行ログを監視し、完了後に以下をユーザーに報告する:
- メタ更新件数 / 本文取得件数 / 本文未取得の残り件数
- レート制限で中断した場合はその旨

## 自動化（Vercel Cron）

`vercel.json` の cron で毎日 `/api/cron/sync-zenn` が呼ばれ、`syncZenn()` が実行される。
本文NULLが0の定常状態では詳細fetchが発生せず軽量に完了する。

## 前提条件

- `npm install` 済みであること
- `.env` に `DATABASE_URL`（Neonの接続文字列）が設定されていること
- Neon上に `zenn_articles` テーブルが作成済みであること（`npm run schema:apply` 実行済み）

## トラブルシューティング

- `429 / text/html(Cloudflare)` → レート制限。しばらく（Retry-After 約20分）待ってから再実行。
  Phase Bは自動中断するので、ブロックを深追いしない。
- `relation "zenn_articles" does not exist` → `npm run schema:apply` でテーブル作成
- `DATABASE_URL が設定されていません` → `.env` を確認
