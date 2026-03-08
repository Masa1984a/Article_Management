# note_articles テーブルスキーマ

| カラム | 型 | 説明 |
|---|---|---|
| key | TEXT (PK) | noteの記事キー（URL末尾の文字列） |
| title | TEXT | 記事タイトル |
| body | TEXT | 本文（HTML形式） |
| cover_image_url | TEXT | カバー画像URL |
| like_count | INTEGER | スキ数 |
| tags | JSONB | タグ配列 例: ["#KAST", "#Solana"] |
| published_at | TIMESTAMPTZ | 公開日時 |
| synced_at | TIMESTAMPTZ | 最終同期日時 |
| url | TEXT | 記事の完全URL |
| is_paid | BOOLEAN | 有料記事フラグ |
| magazine | JSONB | マガジン情報 |
| created_at | TIMESTAMPTZ | レコード作成日時 |
| updated_at | TIMESTAMPTZ | レコード更新日時 |
| fts | tsvector (generated) | 全文検索用（title + body + tags） |

## インデックス

- `idx_note_articles_title_trgm` — タイトルのtrigram GIN
- `idx_note_articles_body_trgm` — 本文のtrigram GIN
- `idx_note_articles_tags` — タグのGIN
- `idx_note_articles_published_at` — 公開日時DESC
- `idx_note_articles_fts` — tsvector GIN
