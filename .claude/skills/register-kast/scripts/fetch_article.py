"""
KAST記事のWebページを取得し、タイトル・本文・公開日を抽出するスクリプト

Usage:
  python fetch_article.py <url>

出力: JSON形式で title, content, published_date, slug, source_url, media を返す
"""
import os
import sys
import json
import re
from pathlib import Path
from urllib.parse import urlparse


def load_env():
    """プロジェクトルートの.envを読み込む"""
    candidates = [
        Path(__file__).resolve().parents[3],
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


def detect_media(url: str) -> str | None:
    """URLから媒体種別を判別"""
    host = urlparse(url).hostname or ""
    path = urlparse(url).path or ""
    if "academy.kast.xyz" in host:
        return "academy"
    if "kast.xyz" in host and "/blog" in path:
        return "blog"
    if ("x.com" in host or "twitter.com" in host) and "KASTxyz" in path:
        return "x_kast"
    if ("x.com" in host or "twitter.com" in host) and "raagulanpathy" in path.lower():
        return "x_raagulan"
    return None


def extract_slug(url: str) -> str:
    """URLの最後のパスセグメントをslugとして抽出"""
    path = urlparse(url).path.rstrip("/")
    return path.split("/")[-1] if path else ""


def fetch_and_parse(url: str) -> dict:
    """URLからページを取得してコンテンツを抽出"""
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    # <title>タグからタイトル抽出
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else ""
    # " | KAST" などのサフィックスを除去
    title = re.sub(r"\s*[\|–—-]\s*KAST.*$", "", title).strip()

    # OGP description
    og_desc_match = re.search(
        r'<meta\s+(?:property|name)=["\']og:description["\']\s+content=["\'](.*?)["\']',
        html, re.IGNORECASE | re.DOTALL,
    )
    og_desc = og_desc_match.group(1).strip() if og_desc_match else ""

    # 公開日の抽出を試みる（meta tags / JSON-LD / テキスト内の日付）
    published_date = None
    # JSON-LD
    jsonld_match = re.search(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE)
    if jsonld_match:
        try:
            ld = json.loads(jsonld_match.group(1))
            if isinstance(ld, list):
                ld = ld[0]
            published_date = ld.get("datePublished") or ld.get("dateCreated")
        except (json.JSONDecodeError, AttributeError):
            pass

    # meta article:published_time
    if not published_date:
        pub_match = re.search(
            r'<meta\s+(?:property|name)=["\']article:published_time["\']\s+content=["\'](.*?)["\']',
            html, re.IGNORECASE,
        )
        if pub_match:
            published_date = pub_match.group(1).strip()

    # 日付をYYYY-MM-DD形式に正規化
    if published_date:
        date_match = re.match(r"(\d{4}-\d{2}-\d{2})", published_date)
        published_date = date_match.group(1) if date_match else None

    # 本文抽出: <article> or <main> タグ内のテキスト、またはbody全体からHTMLタグ除去
    content_html = ""
    for tag in ["article", "main"]:
        m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, re.DOTALL | re.IGNORECASE)
        if m:
            content_html = m.group(1)
            break
    if not content_html:
        body_match = re.search(r"<body[^>]*>(.*?)</body>", html, re.DOTALL | re.IGNORECASE)
        content_html = body_match.group(1) if body_match else html

    # HTMLをマークダウン風プレーンテキストに変換
    text = content_html
    # 見出しをマークダウンに
    for i in range(1, 7):
        text = re.sub(rf"<h{i}[^>]*>(.*?)</h{i}>", rf"\n{'#' * i} \1\n", text, flags=re.DOTALL | re.IGNORECASE)
    # リストアイテム
    text = re.sub(r"<li[^>]*>(.*?)</li>", r"\n- \1", text, flags=re.DOTALL | re.IGNORECASE)
    # 段落・改行
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<p[^>]*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "", text, flags=re.IGNORECASE)
    # 残りのHTMLタグ除去
    text = re.sub(r"<[^>]+>", "", text)
    # HTMLエンティティ
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ")
    # 余分な空行・空白の整理
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    content = text.strip()

    return {
        "title": title,
        "content": content,
        "og_description": og_desc,
        "published_date": published_date,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_article.py <url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    slug = extract_slug(url)
    media = detect_media(url)

    # DB存在チェック
    load_env()
    from supabase import create_client
    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    existing = supabase.table("kast_articles").select("id, title, slug, media, published_date").eq("slug", slug).execute()
    if existing.data:
        result = {
            "status": "exists",
            "article": existing.data[0],
        }
        print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        return

    # 記事を取得・パース
    try:
        parsed = fetch_and_parse(url)
    except Exception as e:
        print(json.dumps({"status": "fetch_error", "error": str(e)}, ensure_ascii=False, indent=2))
        sys.exit(1)

    result = {
        "status": "not_found",
        "parsed": {
            "title": parsed["title"],
            "content": parsed["content"],
            "slug": slug,
            "source_url": url,
            "media": media,
            "published_date": parsed["published_date"],
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
