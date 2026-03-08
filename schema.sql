-- ============================================
-- Zenn記事管理テーブル定義
-- Database: Supabase (PostgreSQL)
-- ============================================

-- 記事テーブル
CREATE TABLE IF NOT EXISTS zenn_articles (
  -- ZennのスラッグをPKとして使用
  slug        TEXT PRIMARY KEY,
  -- 記事タイトル
  title       TEXT NOT NULL,
  -- 本文（HTML形式 — Zenn APIはMarkdownではなくHTMLを返す）
  body_html   TEXT,
  -- カバー画像URL
  cover_image_url TEXT,
  -- いいね数（定期同期で更新）
  liked_count INTEGER NOT NULL DEFAULT 0,
  -- タグ（トピック）をJSONB型で保存 例: ["python", "nextjs"]
  topics      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 公開日時
  published_at TIMESTAMPTZ,
  -- 最終同期日時（スクリプト実行時に更新）
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 記事URL（完全URL）
  article_url TEXT NOT NULL,
  -- Zenn記事のアイキャッチ絵文字
  emoji       TEXT,
  -- レコード作成日時
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- レコード更新日時
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at を自動更新するトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_zenn_articles_updated_at
  BEFORE UPDATE ON zenn_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 全文検索インデックス
-- タイトル・本文・タグを横断検索可能にする
-- ============================================

-- 日本語検索用: pg_bigm拡張が利用可能な場合はそちらが望ましいが、
-- Supabaseではデフォルトで利用できないため、
-- trigram (pg_trgm) + GINインデックスで部分一致検索を実現する

-- pg_trgm拡張を有効化（Supabaseでサポート済み）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- タイトルに対するtrigramインデックス
CREATE INDEX IF NOT EXISTS idx_zenn_articles_title_trgm
  ON zenn_articles USING gin (title gin_trgm_ops);

-- 本文に対するtrigramインデックス
CREATE INDEX IF NOT EXISTS idx_zenn_articles_body_trgm
  ON zenn_articles USING gin (body_html gin_trgm_ops);

-- タグ検索用のGINインデックス
CREATE INDEX IF NOT EXISTS idx_zenn_articles_topics
  ON zenn_articles USING gin (topics);

-- 公開日時の降順ソート用インデックス
CREATE INDEX IF NOT EXISTS idx_zenn_articles_published_at
  ON zenn_articles (published_at DESC);

-- PostgreSQL標準の全文検索（tsvector）も追加
-- 英語トークンや記号ベースの検索に有効
ALTER TABLE zenn_articles
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(body_html, '') || ' ' ||
      coalesce(topics::text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_zenn_articles_fts
  ON zenn_articles USING gin (fts);
