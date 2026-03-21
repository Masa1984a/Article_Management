"""
KAST記事のCRUD操作を行うヘルパースクリプト

Usage:
  python kast_crud.py list [--media blog|academy] [--limit N] [--search KEYWORD]
  python kast_crud.py get <id_or_slug>
  python kast_crud.py create --json '<json_data>'
  python kast_crud.py update <id_or_slug> --json '<json_data>'
  python kast_crud.py delete <id_or_slug>
  python kast_crud.py stats
"""
import os
import sys
import json
import argparse
from pathlib import Path

# .envを探して読み込む
def load_env():
    """プロジェクトルートの.envを読み込む"""
    # スクリプトの場所から遡ってプロジェクトルートを探す
    candidates = [
        Path(__file__).resolve().parents[3],  # .claude/skills/kast-articles/scripts -> root
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
    print("ERROR: .env file not found", file=sys.stderr)
    sys.exit(1)

load_env()

from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
TABLE = "kast_articles"


def cmd_list(args):
    """記事一覧を取得"""
    q = supabase.table(TABLE).select(
        "id, title, slug, media, published_date, updated_date, source_url"
    )
    if args.media:
        q = q.eq("media", args.media)
    if args.search:
        q = q.or_(f"title.ilike.%{args.search}%,content.ilike.%{args.search}%,slug.ilike.%{args.search}%")
    q = q.order("published_date", desc=True)
    if args.limit:
        q = q.limit(args.limit)

    res = q.execute()
    print(json.dumps(res.data, ensure_ascii=False, indent=2, default=str))
    print(f"\n--- {len(res.data)} articles ---", file=sys.stderr)


def cmd_get(args):
    """記事詳細を取得（IDまたはslugで検索）"""
    identifier = args.id_or_slug
    if identifier.isdigit():
        res = supabase.table(TABLE).select("*").eq("id", int(identifier)).execute()
    else:
        res = supabase.table(TABLE).select("*").eq("slug", identifier).execute()

    if not res.data:
        print(f"ERROR: Article not found: {identifier}", file=sys.stderr)
        sys.exit(1)

    article = res.data[0]
    # contentが長い場合は先頭500文字+省略表示（--fullで全文）
    if not args.full and article.get("content") and len(article["content"]) > 500:
        article["content"] = article["content"][:500] + "\n... (truncated, use --full to see all)"
    print(json.dumps(article, ensure_ascii=False, indent=2, default=str))


def cmd_create(args):
    """記事を新規作成"""
    data = json.loads(args.json)

    # 必須フィールドチェック
    required = ["title", "content"]
    missing = [f for f in required if f not in data or not data[f]]
    if missing:
        print(json.dumps({"error": "missing_fields", "fields": missing}))
        sys.exit(1)

    # updated_atを現在時刻に
    data["updated_at"] = "now()"

    res = supabase.table(TABLE).insert(data).execute()
    print(json.dumps(res.data[0], ensure_ascii=False, indent=2, default=str))
    print(f"Created article ID: {res.data[0]['id']}", file=sys.stderr)


def cmd_update(args):
    """記事を更新"""
    identifier = args.id_or_slug
    data = json.loads(args.json)

    # updated_atを自動更新
    data["updated_at"] = "now()"

    if identifier.isdigit():
        res = supabase.table(TABLE).update(data).eq("id", int(identifier)).execute()
    else:
        res = supabase.table(TABLE).update(data).eq("slug", identifier).execute()

    if not res.data:
        print(f"ERROR: Article not found: {identifier}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(res.data[0], ensure_ascii=False, indent=2, default=str))
    print(f"Updated article: {identifier}", file=sys.stderr)


def cmd_delete(args):
    """記事を削除"""
    identifier = args.id_or_slug

    # まず存在確認
    if identifier.isdigit():
        check = supabase.table(TABLE).select("id, title, slug").eq("id", int(identifier)).execute()
    else:
        check = supabase.table(TABLE).select("id, title, slug").eq("slug", identifier).execute()

    if not check.data:
        print(f"ERROR: Article not found: {identifier}", file=sys.stderr)
        sys.exit(1)

    article = check.data[0]

    if not args.confirm:
        print(json.dumps({
            "action": "confirm_delete",
            "article": article,
            "message": f"Delete '{article['title']}'? Rerun with --confirm to proceed."
        }, ensure_ascii=False, indent=2))
        sys.exit(0)

    supabase.table(TABLE).delete().eq("id", article["id"]).execute()
    print(json.dumps({"deleted": article}, ensure_ascii=False, indent=2))
    print(f"Deleted article ID: {article['id']}", file=sys.stderr)


def cmd_stats(args):
    """テーブルの統計情報"""
    total = supabase.table(TABLE).select("id", count="exact").execute()
    no_url = supabase.table(TABLE).select("id", count="exact").is_("source_url", "null").execute()

    # 全メディアタイプを動的に集計
    all_records = supabase.table(TABLE).select("media").execute()
    from collections import Counter
    media_counts = Counter(r["media"] for r in all_records.data)

    latest = supabase.table(TABLE).select("title, published_date, media").order("published_date", desc=True).limit(3).execute()
    oldest = supabase.table(TABLE).select("title, published_date, media").order("published_date").limit(3).execute()

    stats = {
        "total": total.count,
        "by_media": dict(media_counts),
        "no_source_url": no_url.count,
        "latest_3": latest.data,
        "oldest_3": oldest.data,
    }
    print(json.dumps(stats, ensure_ascii=False, indent=2, default=str))


def main():
    parser = argparse.ArgumentParser(description="KAST Articles CRUD")
    sub = parser.add_subparsers(dest="command", required=True)

    # list
    p_list = sub.add_parser("list")
    p_list.add_argument("--media", choices=["blog", "academy", "x_kast", "x_raagulan"])
    p_list.add_argument("--limit", type=int, default=20)
    p_list.add_argument("--search", type=str)

    # get
    p_get = sub.add_parser("get")
    p_get.add_argument("id_or_slug")
    p_get.add_argument("--full", action="store_true")

    # create
    p_create = sub.add_parser("create")
    p_create.add_argument("--json", required=True)

    # update
    p_update = sub.add_parser("update")
    p_update.add_argument("id_or_slug")
    p_update.add_argument("--json", required=True)

    # delete
    p_delete = sub.add_parser("delete")
    p_delete.add_argument("id_or_slug")
    p_delete.add_argument("--confirm", action="store_true")

    # stats
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
