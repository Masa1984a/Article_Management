---
name: analyze-note
description: Supabaseに保存されたnote記事データを分析・検索する。記事の検索、タグ分析、スキ数ランキング、統計情報、トレンド分析、有料記事の抽出など。「note記事を分析」「note記事を検索」「スキ数ランキング」「noteのタグ集計」「noteの統計」「有料記事」などのリクエストで使用する。noteとZennの横断分析（「全記事の統計」「プラットフォーム比較」など）にも使用する。
---

# note記事の分析

Supabaseのnote_articlesテーブルに保存された記事データを分析・検索する。

## 分析の実行方法

プロジェクトルートの `analyze_note.ts` を使って分析する。一時ファイルの作成は不要。

### コマンド一覧

```bash
# 最新N件の記事を取得（デフォルト: 5件、本文付き）
npm run analyze:note -- latest [N]

# 最新N件の記事を取得（本文なし、一覧表示向け）
npm run analyze:note -- latest [N] --no-body

# キーワード検索（タイトル＋本文）
npm run analyze:note -- search <keyword>

# 統計情報（総記事数、スキ数、月別投稿数など）
npm run analyze:note -- stats

# スキ数ランキング（デフォルト: 10件）
npm run analyze:note -- ranking [N]

# タグ使用頻度ランキング（デフォルト: 10件）
npm run analyze:note -- tags [N]

# 特定の記事をキーで取得
npm run analyze:note -- article <key>
```

### オプション

- `--no-body` — 本文を出力しない（記事一覧の把握に便利）
- `--tag "#KAST"` — 特定タグで絞り込み（latest / search / ranking で使用可能）

### 使用例

```bash
# KAST関連の最新3件を本文付きで取得
npm run analyze:note -- latest 3 --tag "#KAST"

# 「資金調達」を含む記事を検索（本文なし）
npm run analyze:note -- search 資金調達 --no-body

# スキ数TOP5を表示
npm run analyze:note -- ranking 5
```

## テーブルスキーマ

詳細は [references/schema.md](references/schema.md) を参照。

## カスタムクエリが必要な場合

上記コマンドでカバーできない複雑な分析が必要な場合は、プロジェクトルートに一時的なTypeScriptファイルを作成し `npx tsx` で実行する。実行後は一時ファイルを削除する。

```typescript
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from("note_articles")
    .select("...")
    // カスタムクエリをここに記述
  if (error) throw error;
  console.log(data);
}
main();
```

## クロスプラットフォーム分析

ZennとnoteのデータはSupabase上の別テーブル（`zenn_articles` / `note_articles`）にある。
横断分析が求められた場合は、両テーブルからデータを取得して比較するカスタムクエリを使う。

## 出力ガイドライン

- 結果はマークダウンの表形式で見やすく整形して報告する
- 数値データは必要に応じてソートや上位N件に絞る
- ユーザーの質問に直接答える形でサマリーを添える
