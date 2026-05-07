---
name: analyze-zenn
description: Neon DBに保存されたZenn記事データを分析・検索する。記事の検索、タグ分析、いいねランキング、統計情報、トレンド分析など。「Zenn記事を分析」「記事を検索」「いいねランキング」「タグ集計」「記事の統計」などのリクエストで使用する。noteとZennの横断分析（「全記事の統計」「プラットフォーム比較」など）にも使用する。
---

# Zenn記事の分析

Neon DB の zenn_articles テーブルに保存された記事データを分析・検索する。

## 分析の実行方法

プロジェクトルートに一時的なTypeScriptファイルを作成し、`npx tsx` で実行する。実行後は一時ファイルを削除する。

```typescript
import { sql } from "./db.js";

async function main() {
  // 例: いいね数TOP10
  const rows = await sql`
    SELECT title, liked_count, topics, published_at, article_url
    FROM zenn_articles
    ORDER BY liked_count DESC
    LIMIT 10
  `;
  console.log(rows);
}
main();
```

## テーブルスキーマ

詳細は [references/schema.md](references/schema.md) を参照。

## 分析カテゴリ

### 1. 記事検索

- キーワード検索: `title ILIKE '%keyword%'` または `body_html ILIKE '%keyword%'`
- タグ絞り込み: `topics` カラム（JSONB配列）に対して `topics @> '["python"]'::jsonb`
- 組み合わせ検索: WHERE句で AND/OR で結合

### 2. ランキング・集計

- いいね数ランキング: `ORDER BY liked_count DESC`
- 記事数の時系列推移: `GROUP BY date_trunc('month', published_at)`
- タグ別集計: `jsonb_array_elements_text(topics)` をUNNESTしてGROUP BY

### 3. 統計・トレンド

- 総記事数、平均いいね数、合計いいね数
- 月別・年別の投稿数推移
- 最もよく使われるタグのランキング

## 出力ガイドライン

- 結果はマークダウンの表形式で見やすく整形して報告する
- 数値データは必要に応じてソートや上位N件に絞る
- ユーザーの質問に直接答える形でサマリーを添える
