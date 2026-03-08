# zenn_articles テーブルスキーマ

| カラム | 型 | 説明 |
|---|---|---|
| slug | TEXT (PK) | ZennのスラッグID |
| title | TEXT | 記事タイトル |
| body_html | TEXT | 本文（HTML形式） |
| cover_image_url | TEXT | カバー画像URL |
| liked_count | INTEGER | いいね数 |
| topics | JSONB | タグ配列 例: ["python", "nextjs"] |
| published_at | TIMESTAMPTZ | 公開日時 |
| synced_at | TIMESTAMPTZ | 最終同期日時 |
| article_url | TEXT | 記事の完全URL |
| emoji | TEXT | アイキャッチ絵文字 |
| created_at | TIMESTAMPTZ | レコード作成日時 |
| updated_at | TIMESTAMPTZ | レコード更新日時 |
| fts | tsvector (generated) | 全文検索用（title + body_html + topics） |

## インデックス

- `idx_zenn_articles_title_trgm` — タイトルのtrigram GIN
- `idx_zenn_articles_body_trgm` — 本文のtrigram GIN
- `idx_zenn_articles_topics` — タグのGIN
- `idx_zenn_articles_published_at` — 公開日時DESC
- `idx_zenn_articles_fts` — tsvector GIN
