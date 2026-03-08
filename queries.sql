-- ============================================
-- 動作確認用SQLクエリ集
-- ============================================

-- 1. 全記事一覧（公開日時降順）
SELECT
  emoji,
  title,
  liked_count,
  topics,
  published_at,
  article_url
FROM zenn_articles
ORDER BY published_at DESC;

-- 2. タグで絞り込み（例: "python" タグを含む記事）
SELECT
  emoji,
  title,
  liked_count,
  topics,
  published_at,
  article_url
FROM zenn_articles
WHERE topics ? 'python'
ORDER BY published_at DESC;

-- 3. 複数タグのAND検索（例: "nextjs" AND "typescript"）
SELECT
  emoji,
  title,
  liked_count,
  topics,
  published_at,
  article_url
FROM zenn_articles
WHERE topics ?& array['nextjs', 'typescript']
ORDER BY published_at DESC;

-- 4. キーワード全文検索（trigram: 部分一致、日本語対応）
SELECT
  emoji,
  title,
  liked_count,
  similarity(title, 'キーワード') AS title_score,
  published_at,
  article_url
FROM zenn_articles
WHERE
  title % 'キーワード'
  OR body_html % 'キーワード'
ORDER BY title_score DESC;

-- 5. キーワード全文検索（LIKE: シンプルな部分一致）
SELECT
  emoji,
  title,
  liked_count,
  published_at,
  article_url
FROM zenn_articles
WHERE
  title ILIKE '%検索ワード%'
  OR body_html ILIKE '%検索ワード%'
ORDER BY published_at DESC;

-- 6. tsvector全文検索（英語キーワードや記号ベース）
SELECT
  emoji,
  title,
  liked_count,
  published_at,
  article_url
FROM zenn_articles
WHERE fts @@ to_tsquery('simple', 'supabase & nextjs')
ORDER BY published_at DESC;

-- 7. いいね数ランキング
SELECT
  emoji,
  title,
  liked_count,
  published_at,
  article_url
FROM zenn_articles
ORDER BY liked_count DESC
LIMIT 10;

-- 8. 同期状況の確認
SELECT
  slug,
  title,
  synced_at,
  updated_at
FROM zenn_articles
ORDER BY synced_at DESC;

-- ============================================
-- note記事用クエリ
-- ============================================

-- 9. note全記事一覧（公開日時降順）
SELECT
  title,
  like_count,
  tags,
  published_at,
  url,
  is_paid
FROM note_articles
ORDER BY published_at DESC;

-- 10. タグで絞り込み（例: "AI" タグを含む記事）
SELECT
  title,
  like_count,
  tags,
  published_at,
  url
FROM note_articles
WHERE tags ? 'AI'
ORDER BY published_at DESC;

-- 11. キーワード全文検索（ILIKE: 部分一致）
SELECT
  title,
  like_count,
  published_at,
  url
FROM note_articles
WHERE
  title ILIKE '%検索ワード%'
  OR body ILIKE '%検索ワード%'
ORDER BY published_at DESC;

-- 12. スキ数ランキング（トップ10）
SELECT
  title,
  like_count,
  published_at,
  url
FROM note_articles
ORDER BY like_count DESC
LIMIT 10;

-- 13. 有料記事のみ抽出
SELECT
  title,
  like_count,
  tags,
  published_at,
  url
FROM note_articles
WHERE is_paid = true
ORDER BY published_at DESC;
