# Zenn・note・KAST 記事管理システム

Zenn・note・KAST記事を **Neon (Vercel Postgres)** に同期し、全文検索・タグ検索を可能にするシステム。

## アーキテクチャ

| 層 | 技術 |
|---|---|
| データベース | Neon (PostgreSQL on Vercel) |
| TS DBアクセス | `@neondatabase/serverless` (HTTPS経由) |
| Python DBアクセス | `.claude/skills/_shared/neon_http.py`（自製requests製ラッパー、HTTPS経由） |

`@neondatabase/serverless` および `_shared/neon_http.py` はいずれも **HTTPS:443** のみでDBアクセスできるため、PostgreSQLポート(5432/6543)がブロックされた企業ネットワークでも動作する。

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
pip install requests
```

### 2. Neon DBの作成

Vercel Dashboard → Storage → Create Database → Neon → リージョン選択 → 作成。

プロジェクトのEnvironment Variablesに `DATABASE_URL` が自動付与される。
ローカル開発では Vercel CLI で `vercel env pull .env` するか、Neon Dashboard から手動コピー。

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集:

```
DATABASE_URL=postgresql://user:password@ep-xxxxx.region.aws.neon.tech/dbname?sslmode=require
ZENN_USERNAME=myoshida2
NOTE_USERNAME=masa0416ab
```

### 4. スキーマ適用

```bash
npm run schema:apply
```

これにより以下が作成される:
- `zenn_articles` / `note_articles` / `kast_articles` テーブル
- `pg_trgm` 拡張
- 全文検索インデックス（trigram + tsvector）
- タグ検索用GINインデックス
- `updated_at` 自動更新トリガー

### 5. 同期の実行

```bash
npm run sync:zenn   # Zenn記事のみ
npm run sync:note   # note記事のみ
npm run sync:all    # 全プラットフォーム
```

KAST記事は `/register-kast` skill 経由でURLを渡して登録、または `/kast-articles` skill でCRUD。

## 対応プラットフォーム

### Zenn

- Zenn公開APIから記事一覧・本文（HTML）を取得
- ページネーション対応
- トピック（タグ）・いいね数・アイキャッチ絵文字を保存

### note

- note非公式APIから記事一覧・本文を取得
- ページネーション対応
- タグ・スキ数・有料記事フラグを保存

### KAST

- academy.kast.xyz / kast.xyz/blog / x.com の記事を手動登録
- `register-kast` skillでURLパース、`kast-articles` skillでCRUD

## ファイル構成

```
├── schema.sql              # テーブル定義・インデックス作成SQL
├── db.ts                   # Neon DBクライアント (TS)
├── apply_schema.ts         # schema.sql適用スクリプト
├── sync_zenn.ts            # Zenn記事同期
├── sync_note.ts            # note記事同期
├── analyze_note.ts         # note記事分析
└── .claude/skills/
    ├── _shared/
    │   └── neon_http.py    # Python用Neon HTTPクライアント（共有）
    └── ...                 # Claude Codeスキル定義
```

## 検索クエリの例

`queries.sql` に動作確認用のSQLクエリが含まれている。
Neon SQL Editor（Neon Console）で実行できる。
