# Zenn記事管理システム

Zenn記事をSupabase（PostgreSQL）に同期し、全文検索・タグ検索を可能にするシステム。

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. データベースのセットアップ

Supabaseダッシュボードの **SQL Editor** で `schema.sql` を実行する。

これにより以下が作成される:
- `zenn_articles` テーブル
- `pg_trgm` 拡張（日本語部分一致検索用）
- 全文検索インデックス（trigram + tsvector）
- タグ検索用GINインデックス
- `updated_at` 自動更新トリガー

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集し、Supabaseの接続情報を設定:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ZENN_USERNAME=myoshida2
```

> **SUPABASE_KEY** には `service_role` キーを推奨（RLSをバイパスして書き込み可能）。
> Supabaseダッシュボード → Settings → API で確認できる。

### 4. 同期の実行

```bash
npm run sync
```

全記事の一覧取得 → 各記事の本文取得 → Supabaseへupsert が行われる。

## 検索クエリの例

`queries.sql` に動作確認用のSQLクエリが含まれている。
Supabaseダッシュボードの SQL Editor で実行できる。

| クエリ | 内容 |
|---|---|
| 全記事一覧 | 公開日時降順で全件取得 |
| タグ絞り込み | 特定タグを含む記事を検索 |
| ILIKE検索 | 日本語キーワードの部分一致検索 |
| trigram検索 | 類似度ベースのあいまい検索 |
| tsvector検索 | 英語キーワードのトークン検索 |
| いいねランキング | いいね数順のトップ10 |

## ファイル構成

```
├── schema.sql        # テーブル定義・インデックス作成SQL
├── sync_zenn.ts      # Zenn記事同期スクリプト
├── queries.sql       # 動作確認用SQLクエリ集
├── package.json      # Node.js依存関係
├── .env.example      # 環境変数テンプレート
└── .gitignore
```

## 今後の拡張予定

- note・X投稿の管理テーブル追加
- Vercel Cronによる定期自動同期
- Webアプリ（Next.js）からの検索UI
