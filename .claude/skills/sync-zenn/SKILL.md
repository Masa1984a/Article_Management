---
name: sync-zenn
description: Zenn記事をSupabaseへ洗い替え（全件同期）する。Zenn公開APIから記事一覧・本文を取得し、Supabaseへupsertする。「Zenn記事を洗い替える」「Zenn同期」「記事を更新」「sync」などのリクエストで使用する。また「全記事を同期」「すべて同期」のように全プラットフォーム同期を求められた場合にも使用する。
---

# Zenn記事の洗い替え

Zenn公開APIから全記事を取得し、Supabaseのzenn_articlesテーブルへupsertで同期する。

## 実行手順

### Zenn記事のみ同期する場合

```bash
npm run sync:zenn
```

### noteも含めて全プラットフォームを一括同期する場合

```bash
npm run sync:all
```

実行ログを監視し、完了後に以下をユーザーに報告する:
   - 取得した記事数
   - 成功件数 / 失敗件数
   - エラーがあった場合はその内容と対処案

## 前提条件

- `npm install` 済みであること
- `.env` に `SUPABASE_URL` と `SUPABASE_KEY`（service_role key）が設定されていること
- Supabase上に `zenn_articles` テーブルが作成済みであること（`schema.sql` を実行済み）

## トラブルシューティング

- `Could not find the table` → `schema.sql` をSupabase SQL Editorで実行してテーブルを作成する
- `SUPABASE_URL / SUPABASE_KEY が設定されていません` → `.env` ファイルを確認する
- API取得エラーが多発する場合 → Zenn APIの一時的な不調の可能性があるため、時間を置いて再実行する
