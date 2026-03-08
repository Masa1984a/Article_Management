---
name: analyze-note
description: Supabaseに保存されたnote記事データを分析・検索する。記事の検索、タグ分析、スキ数ランキング、統計情報、トレンド分析、有料記事の抽出など。「note記事を分析」「note記事を検索」「スキ数ランキング」「noteのタグ集計」「noteの統計」「有料記事」などのリクエストで使用する。noteとZennの横断分析（「全記事の統計」「プラットフォーム比較」など）にも使用する。
---

# note記事の分析

Supabaseのnote_articlesテーブルに保存された記事データを分析・検索する。

## 分析の実行方法

プロジェクトルートに一時的なTypeScriptファイルを作成し、`npx tsx` で実行する。実行後は一時ファイルを削除する。

```typescript
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// ここにクエリを記述
const { data, error } = await supabase
  .from("note_articles")
  .select("...")
  ...
```

## テーブルスキーマ

詳細は [references/schema.md](references/schema.md) を参照。

## 分析カテゴリ

### 1. 記事検索

- キーワード検索: `title` や `body` に対して `.ilike()` で部分一致
- タグ絞り込み: `tags` カラム（JSONB配列）に対して `.contains()`
- 有料記事の抽出: `is_paid` カラムで `.eq("is_paid", true)`
- 組み合わせ検索: 複数条件をチェーンで結合

### 2. ランキング・集計

- スキ数ランキング: `.order("like_count", { ascending: false })`
- 記事数の時系列推移: `published_at` でグルーピング
- タグ別集計: 全記事の `tags` を集約

### 3. 統計・トレンド

- 総記事数、平均スキ数、合計スキ数
- 月別・年別の投稿数推移
- 最もよく使われるタグのランキング
- 有料記事 vs 無料記事の比較

### 4. クロスプラットフォーム分析

ZennとnoteのデータはSupabase上の別テーブル（`zenn_articles` / `note_articles`）にある。
横断分析が求められた場合は、両テーブルからデータを取得して比較する。

```typescript
const [zenn, note] = await Promise.all([
  supabase.from("zenn_articles").select("*"),
  supabase.from("note_articles").select("*"),
]);
```

## 出力ガイドライン

- 結果はマークダウンの表形式で見やすく整形して報告する
- 数値データは必要に応じてソートや上位N件に絞る
- ユーザーの質問に直接答える形でサマリーを添える
