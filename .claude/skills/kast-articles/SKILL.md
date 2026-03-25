---
name: kast-articles
description: |
  KAST記事（kast_articles テーブル）の管理スキル。記事の投稿・更新・削除・一覧表示・個別参照・統計表示を行う。
  ユーザーが「KAST記事」「kast_articles」「記事を追加」「記事を更新」「記事一覧」「記事を削除」「記事の統計」
  などと言及した場合にこのスキルを使用する。記事のURLやタイトルを貼り付けた場合も、KAST記事の操作意図として
  このスキルをトリガーする。KASTのブログやアカデミーの記事管理に関するあらゆるリクエストに対応する。
---

# KAST記事管理スキル

Supabase上の `kast_articles` テーブルに対するCRUD操作を、対話形式のワークフローで行うスキル。

## テーブル構造

| カラム | 型 | 説明 | 必須 |
|---|---|---|---|
| id | BIGSERIAL | 主キー（自動採番） | 自動 |
| title | TEXT | 記事タイトル | YES |
| content | TEXT | 記事本文（マークダウン） | YES |
| slug | TEXT (UNIQUE) | URLスラッグ | 推奨 |
| source_url | TEXT | 元記事のURL | 推奨 |
| media | TEXT | 媒体種別: `academy` / `blog` / `x_kast` / `x_raagulan` | 推奨 |
| published_date | DATE | 公開日 | 推奨 |
| updated_date | DATE | 更新日 | - |
| tags | TEXT[] | タグ配列 | - |
| created_at | TIMESTAMPTZ | レコード作成日時（自動） | 自動 |
| updated_at | TIMESTAMPTZ | レコード更新日時（自動） | 自動 |

## CRUDスクリプト

ヘルパースクリプトのパス: `scripts/kast_crud.py`（このSKILL.mdと同じディレクトリ内）

```
python <skill-dir>/scripts/kast_crud.py list [--media blog|academy|x_kast|x_raagulan] [--limit N] [--search KEYWORD]
python <skill-dir>/scripts/kast_crud.py get <id_or_slug> [--full]
python <skill-dir>/scripts/kast_crud.py create --json '<json_data>'
python <skill-dir>/scripts/kast_crud.py create --file <json_file>
python <skill-dir>/scripts/kast_crud.py update <id_or_slug> --json '<json_data>'
python <skill-dir>/scripts/kast_crud.py update <id_or_slug> --file <json_file>
python <skill-dir>/scripts/kast_crud.py delete <id_or_slug> [--confirm]
python <skill-dir>/scripts/kast_crud.py stats
```

**推奨**: 記事本文にシングルクォートやダブルクォート等の特殊文字が含まれる場合、`--json` はbashのクォーティング問題が発生しやすいため、`--file` でJSONファイルを渡す方法を使うこと。

## ワークフロー

ユーザーのリクエストを受けたら、まず **意図を判別** し、以下のフローに従う。

### 1. 意図の判別

ユーザーの発言から操作意図を読み取る:

| ユーザーの意図 | 操作 |
|---|---|
| 記事を追加したい / 新しい記事を投稿 / URLを貼ってこれを登録して | **CREATE** |
| 記事を修正 / タイトルを変えたい / 内容を更新 | **UPDATE** |
| 記事を消したい / 削除して | **DELETE** |
| 記事の一覧 / 最近の記事 / blogの記事を見せて | **LIST** |
| この記事の詳細 / slug:xxx の中身 | **GET** |
| 記事の件数 / 統計 | **STATS** |

### 2. CREATE（新規投稿）フロー

ユーザーが記事を投稿したい場合、以下の情報が必要。不足があれば対話で補完する。

**必須情報（なければ必ずヒアリング）:**
- `title` — 記事のタイトル
- `content` — 記事の本文

**推奨情報（なければヒアリングするが、スキップ可）:**
- `media` — 媒体種別。URLから自動判別できる場合はそうする:
  - `academy.kast.xyz` → `academy`
  - `www.kast.xyz/blog` → `blog`
  - `x.com/KASTxyz` or `twitter.com/KASTxyz` → `x_kast`
  - `x.com/raagulanpathy` or `twitter.com/raagulanpathy`（Raagulan Pathy） → `x_raagulan`
  - それ以外や不明なら聞く
- `source_url` — 元記事のURL
- `slug` — URLスラッグ。source_urlから自動生成できる（URLの最後のパスセグメント）
- `published_date` — 公開日。記事本文内に日付があれば抽出を試みる

**対話例:**
```
ユーザー: この記事を登録して https://academy.kast.xyz/en-us/articles/new-feature
→ URLから media=academy, slug=new-feature を自動推定
→ 「記事のタイトルと本文を教えてください。公開日はわかりますか？」
```

```
ユーザー: 新しいブログ記事を追加。タイトルは「KASTの新機能」
→ titleは取得済み
→ 「記事の本文を教えてください。元記事のURLと公開日もあれば教えてください。」
```

入力が揃ったら確認メッセージを表示し、ユーザーが承認したらスクリプトで投入する。

### 3. UPDATE（更新）フロー

1. まず対象記事を特定する（ID、slug、タイトルの一部など）
2. `get` で現在の内容を表示
3. 何を変更するかヒアリング
4. 変更内容を確認表示し、承認後に実行

### 4. DELETE（削除）フロー

1. 対象記事を特定
2. 記事の情報を表示して確認: 「この記事を削除しますか？」
3. ユーザーが明確に承認した場合のみ `--confirm` 付きで実行
4. 削除は取り消せないことを伝える

### 5. LIST（一覧表示）フロー

ユーザーの要望に応じてフィルタを適用:
- 媒体で絞り込み: `--media blog` / `--media academy`
- キーワード検索: `--search キーワード`
- 件数制限: `--limit N`（デフォルト20件）

結果は見やすい表形式で表示する。

### 6. GET（個別参照）フロー

IDまたはslugで検索し、記事の詳細を表示。本文が長い場合はデフォルトで先頭500文字を表示し、全文が必要なら `--full` を使う。

### 7. STATS（統計）フロー

テーブルの統計情報（総件数、媒体別件数、最新/最古の記事など）を表示。

## 注意事項

- データ変更操作（CREATE / UPDATE / DELETE）は必ず実行前にユーザーへ確認を取る
- `slug` はユニーク制約があるため、重複する場合はエラーになる。その場合はslugを調整する
- `content` にはマークダウン形式のテキストが格納されている
- URLが提供された場合、`source_url` として保存し、`media` と `slug` はURLから自動推定する
- 日付は `YYYY-MM-DD` 形式で保存する
