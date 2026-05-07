---
name: sync-note
description: note記事をNeon DBへ洗い替え（全件同期）する。note非公式APIから記事一覧・本文を取得し、Neonへupsertする。「note記事を洗い替える」「note同期」「note記事を更新」「noteをsync」などのリクエストで使用する。また「全記事を同期」「すべて同期」のように全プラットフォーム同期を求められた場合にも使用する。
---

# note記事の洗い替え

note非公式API（v2/v3）から全記事を取得し、Neon DB の note_articles テーブルへupsertで同期する。

## 実行手順

### note記事のみ同期する場合

```bash
npm run sync:note
```

### Zennも含めて全プラットフォームを一括同期する場合

```bash
npm run sync:all
```

実行ログを監視し、完了後に以下をユーザーに報告する:
- 取得した記事数
- 成功件数 / 失敗件数
- エラーがあった場合はその内容と対処案

## 前提条件

- `npm install` 済みであること
- `.env` に `DATABASE_URL`（Neonの接続文字列）が設定されていること
- `.env` に `NOTE_USERNAME` が設定されていること（省略時: masa0416ab）
- Neon上に `note_articles` テーブルが作成済みであること（`npm run schema:apply` 実行済み）

## 同期の仕組み

1. 一覧API（v2）で全記事のキー一覧をページネーションで取得
2. 詳細API（v3）で各記事の本文HTML全体を取得
3. Neon DB へupsert（INSERT ... ON CONFLICT (key) DO UPDATE）

note APIは非公式APIのため、仕様変更の可能性がある。エラーが発生した場合はAPIレスポンスの変更を疑うこと。

## トラブルシューティング

- `relation "note_articles" does not exist` → `npm run schema:apply` を実行してテーブルを作成する
- `DATABASE_URL が設定されていません` → `.env` ファイルを確認する
- `note API error: 404` → note APIの仕様変更の可能性。`sync_note.ts` のエンドポイントを確認する
- API取得エラーが多発する場合 → note APIの一時的な不調の可能性があるため、時間を置いて再実行する
