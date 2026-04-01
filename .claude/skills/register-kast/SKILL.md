---
name: registering-kast-article
description: >
  Register KAST-related articles to the database by fetching and parsing web pages.
  Use when the user runs `/register-kast <URL>` or asks to register a KAST article
  from academy.kast.xyz, kast.xyz/blog, x.com/KASTxyz, or x.com/raagulanpathy.
---

# KAST記事の登録スキル

URLを受け取り、未登録ならWebページを取得・パースしてDBに登録する。

## トリガー

`/register-kast <URL>` または `$ARGUMENTS` にURLが渡された場合。

## ワークフロー

### ステップ1: 記事の存在確認とWebページ取得

```bash
python .claude/skills/register-kast/scripts/fetch_article.py $ARGUMENTS
```

出力はJSON。`status` フィールドで分岐する。

### ステップ2: statusに応じた処理

#### `"exists"` → 登録済み

ID・タイトル・slug・媒体・公開日を表示して完了。

#### `"not_found"` → 未登録（登録フロー）

1. `parsed` フィールドの品質チェック:
   - タイトルが空 → ユーザーに確認
   - 本文が100文字未満 → ユーザーに確認
   - 公開日が未取得 → ユーザーに確認 or 今日の日付を仮設定
2. 登録内容をユーザーに確認表示（タイトル、slug、媒体、公開日、本文先頭200文字）
3. ユーザー承認後、JSONファイル経由で登録:

```bash
python .claude/skills/kast-articles/scripts/kast_crud.py create --file <json_file>
```

> **重要**: 本文に特殊文字が含まれることが多いため、必ず `--file` を使用すること。引数での直接渡しは禁止。

4. 登録成功後、ID・タイトル・slug・媒体・公開日を表示。

#### `"fetch_error"` → 取得失敗（WebFetchフォールバック）

1. WebFetchツールでURLを取得し、以下をJSON形式で抽出する:
   - title, published_date (YYYY-MM-DD), content (本文全文), tags
2. 抽出結果に slug, source_url, media を補完してJSONファイルを作成
   - slug: URLの最後のパスセグメント
   - source_url: 元のURL
   - media: 下記の媒体判別表に従う
   - **カラム名に注意**: `published_date`（published_atではない）、`source_url`（urlではない）
3. 以降は `"not_found"` フローのステップ1（品質チェック）から合流する

## 媒体（media）の自動判別

| URLパターン | media値 |
|---|---|
| `academy.kast.xyz` | `academy` |
| `kast.xyz/blog` | `blog` |
| `x.com/KASTxyz` / `twitter.com/KASTxyz` | `x_kast` |
| `x.com/raagulanpathy` / `twitter.com/raagulanpathy` | `x_raagulan` |

## 注意事項

- 登録前に必ずユーザー承認を取ること
- slugはURLの最後のパスセグメントから自動生成
- 抽出精度が低い場合はユーザーに手動修正を促す