"""
KAST記事のCRUD操作を行うヘルパースクリプト (Neon HTTP)

Usage:
  python kast_crud.py list [--media blog|academy|x_kast|x_raagulan] [--limit N] [--search KEYWORD]
  python kast_crud.py get <id_or_slug> [--full]
  python kast_crud.py create --json '<json_data>'
  python kast_crud.py create --file <json_file>
  python kast_crud.py update <id_or_slug> --json '<json_data>'
  python kast_crud.py update <id_or_slug> --file <json_file>
  python kast_crud.py delete <id_or_slug> [--confirm]
  python kast_crud.py stats

環境変数:
  DATABASE_URL — Neonの接続文字列 (.envに設定)
"""
import os
import sys
import json
import argparse
from collections import Counter
from pathlib import Path


def load_env():
    """プロジェクトルートの.envを読み込む"""
    candidates = [
        Path(__file__).resolve().parents[4],  # .../scripts -> .../kast-articles -> .../skills -> .../.claude -> project root
        Path.cwd(),
    ]
    for d in candidates:
        env_path = d / ".env"
        if env_path.exists():
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, val = line.partition("=")
                        os.environ.setdefault(key.strip(), val.strip())
            return


load_env()

# 共有Pythonライブラリ（.claude/skills/_shared/）をimportパスに追加
SHARED_LIB = Path(__file__).resolve().parents[2] / "_shared"
sys.path.insert(0, str(SHARED_LIB))
from neon_http import from_env  # noqa: E402

db = from_env("DATABASE_URL")
TABLE = "kast_articles"

# 一覧表示で取得するカラム
LIST_COLS = "id, title, slug, media, published_date, updated_date, source_url"


def _is_id(s: str) -> bool:
    return s.isdigit()


def cmd_list(args):
    where_parts: list[str] = []
    params: list = []

    if args.media:
        where_parts.append(f"media = ${len(params) + 1}")
        params.append(args.media)
    if args.search:
        # 部分一致検索 (title / content / slug)
        pat = f"%{args.search}%"
        i = len(params)
        where_parts.append(
            f"(title ILIKE ${i + 1} OR content ILIKE ${i + 2} OR slug ILIKE ${i + 3})"
        )
        params.extend([pat, pat, pat])

    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    limit_sql = ""
    if args.limit:
        limit_sql = f"LIMIT ${len(params) + 1}"
        params.append(args.limit)

    sql = f"""
        SELECT {LIST_COLS}
        FROM {TABLE}
        {where_sql}
        ORDER BY published_date DESC NULLS LAST
        {limit_sql}
    """.strip()

    rows = db.query(sql, params)
    print(json.dumps(rows, ensure_ascii=False, indent=2, default=str))
    print(f"\n--- {len(rows)} articles ---", file=sys.stderr)


def cmd_get(args):
    identifier = args.id_or_slug
    if _is_id(identifier):
        rows = db.query(f"SELECT * FROM {TABLE} WHERE id = $1", [int(identifier)])
    else:
        rows = db.query(f"SELECT * FROM {TABLE} WHERE slug = $1", [identifier])

    if not rows:
        print(f"ERROR: Article not found: {identifier}", file=sys.stderr)
        sys.exit(1)

    article = rows[0]
    if not args.full and article.get("content") and len(article["content"]) > 500:
        article["content"] = article["content"][:500] + "\n... (truncated, use --full to see all)"
    print(json.dumps(article, ensure_ascii=False, indent=2, default=str))


def _load_json_arg(args) -> dict:
    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            return json.load(f)
    return json.loads(args.json)


# 入力JSONとしてサポートするカラム（id, created_at, updated_at は手動指定不可 / DB任せ）
WRITABLE_COLS = [
    "title", "content", "slug", "source_url", "media",
    "published_date", "updated_date", "tags",
]


def _build_columns_and_values(data: dict) -> tuple[list[str], list]:
    cols: list[str] = []
    vals: list = []
    for col in WRITABLE_COLS:
        if col in data:
            cols.append(col)
            vals.append(data[col])
    return cols, vals


def cmd_create(args):
    data = _load_json_arg(args)

    required = ["title", "content"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        print(json.dumps({"error": "missing_fields", "fields": missing}))
        sys.exit(1)

    cols, vals = _build_columns_and_values(data)
    if not cols:
        print(json.dumps({"error": "no_writable_fields"}))
        sys.exit(1)

    # tags は text[] なので CAST が必要
    placeholders = []
    for i, col in enumerate(cols, start=1):
        if col == "tags":
            placeholders.append(f"${i}::text[]")
        else:
            placeholders.append(f"${i}")

    sql = (
        f"INSERT INTO {TABLE} ({', '.join(cols)}) "
        f"VALUES ({', '.join(placeholders)}) "
        f"RETURNING *"
    )
    rows = db.query(sql, vals)
    if not rows:
        print(json.dumps({"error": "insert_returned_no_row"}))
        sys.exit(1)
    print(json.dumps(rows[0], ensure_ascii=False, indent=2, default=str))
    print(f"Created article ID: {rows[0]['id']}", file=sys.stderr)


def cmd_update(args):
    identifier = args.id_or_slug
    data = _load_json_arg(args)

    cols, vals = _build_columns_and_values(data)
    if not cols:
        print(json.dumps({"error": "no_writable_fields"}))
        sys.exit(1)

    set_parts: list[str] = []
    for i, col in enumerate(cols, start=1):
        if col == "tags":
            set_parts.append(f"{col} = ${i}::text[]")
        else:
            set_parts.append(f"{col} = ${i}")

    # WHERE プレースホルダ
    where_idx = len(vals) + 1

    if _is_id(identifier):
        where_clause = f"id = ${where_idx}"
        vals.append(int(identifier))
    else:
        where_clause = f"slug = ${where_idx}"
        vals.append(identifier)

    sql = (
        f"UPDATE {TABLE} SET {', '.join(set_parts)}, updated_at = now() "
        f"WHERE {where_clause} RETURNING *"
    )
    rows = db.query(sql, vals)
    if not rows:
        print(f"ERROR: Article not found: {identifier}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(rows[0], ensure_ascii=False, indent=2, default=str))
    print(f"Updated article: {identifier}", file=sys.stderr)


def cmd_delete(args):
    identifier = args.id_or_slug

    if _is_id(identifier):
        check = db.query(
            f"SELECT id, title, slug FROM {TABLE} WHERE id = $1",
            [int(identifier)],
        )
    else:
        check = db.query(
            f"SELECT id, title, slug FROM {TABLE} WHERE slug = $1",
            [identifier],
        )

    if not check:
        print(f"ERROR: Article not found: {identifier}", file=sys.stderr)
        sys.exit(1)

    article = check[0]

    if not args.confirm:
        print(json.dumps({
            "action": "confirm_delete",
            "article": article,
            "message": f"Delete '{article['title']}'? Rerun with --confirm to proceed.",
        }, ensure_ascii=False, indent=2, default=str))
        sys.exit(0)

    db.execute(f"DELETE FROM {TABLE} WHERE id = $1", [article["id"]])
    print(json.dumps({"deleted": article}, ensure_ascii=False, indent=2, default=str))
    print(f"Deleted article ID: {article['id']}", file=sys.stderr)


def cmd_stats(args):
    total_row = db.query_one(f"SELECT COUNT(*)::int AS c FROM {TABLE}")
    no_url_row = db.query_one(
        f"SELECT COUNT(*)::int AS c FROM {TABLE} WHERE source_url IS NULL"
    )
    media_rows = db.query(
        f"SELECT media, COUNT(*)::int AS c FROM {TABLE} GROUP BY media ORDER BY c DESC"
    )
    latest = db.query(
        f"SELECT title, published_date, media FROM {TABLE} "
        f"ORDER BY published_date DESC NULLS LAST LIMIT 3"
    )
    oldest = db.query(
        f"SELECT title, published_date, media FROM {TABLE} "
        f"ORDER BY published_date ASC NULLS LAST LIMIT 3"
    )

    media_counts = {r["media"]: r["c"] for r in media_rows}

    stats = {
        "total": total_row["c"] if total_row else 0,
        "by_media": media_counts,
        "no_source_url": no_url_row["c"] if no_url_row else 0,
        "latest_3": latest,
        "oldest_3": oldest,
    }
    print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))


def main():
    parser = argparse.ArgumentParser(description="KAST Articles CRUD (Neon HTTP)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list")
    p_list.add_argument("--media", choices=["blog", "academy", "x_kast", "x_raagulan"])
    p_list.add_argument("--limit", type=int, default=20)
    p_list.add_argument("--search", type=str)

    p_get = sub.add_parser("get")
    p_get.add_argument("id_or_slug")
    p_get.add_argument("--full", action="store_true")

    p_create = sub.add_parser("create")
    g_create = p_create.add_mutually_exclusive_group(required=True)
    g_create.add_argument("--json", help="JSON string")
    g_create.add_argument("--file", help="Path to JSON file")

    p_update = sub.add_parser("update")
    p_update.add_argument("id_or_slug")
    g_update = p_update.add_mutually_exclusive_group(required=True)
    g_update.add_argument("--json", help="JSON string")
    g_update.add_argument("--file", help="Path to JSON file")

    p_delete = sub.add_parser("delete")
    p_delete.add_argument("id_or_slug")
    p_delete.add_argument("--confirm", action="store_true")

    sub.add_parser("stats")

    args = parser.parse_args()

    cmds = {
        "list": cmd_list,
        "get": cmd_get,
        "create": cmd_create,
        "update": cmd_update,
        "delete": cmd_delete,
        "stats": cmd_stats,
    }
    cmds[args.command](args)


if __name__ == "__main__":
    main()
