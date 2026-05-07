"""
Neon HTTP SQL エンドポイント用 Pythonクライアント

Neonの `@neondatabase/serverless` パッケージと同じHTTPプロトコル
（POST /sql, Neon-Connection-String ヘッダ）をrequestsで実装する。
PostgreSQLポートがブロックされた社内ネットワーク（HTTPS:443のみ可）でも動作する。

使い方:
    from neon_http import NeonClient
    client = NeonClient(os.environ["DATABASE_URL"])
    rows = client.query("SELECT id, title FROM kast_articles WHERE media = $1 LIMIT $2", ["blog", 10])
    # rows は [{"id": ..., "title": ...}, ...] のリスト

    client.execute("UPDATE kast_articles SET title = $1 WHERE id = $2", ["new title", 123])
    # 行を返さない文の場合
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime
from typing import Any, Optional
from urllib.parse import urlparse

import requests


class NeonError(RuntimeError):
    """Neon HTTP API からのエラーレスポンスを表す"""


def _json_default(obj: Any) -> Any:
    """JSON serialize で datetime/date を ISO 8601 文字列にする"""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _serialize_param(p: Any) -> Any:
    """SQLパラメータをHTTP送信用に変換する"""
    if p is None:
        return None
    if isinstance(p, (datetime, date)):
        return p.isoformat()
    if isinstance(p, (list, tuple, dict)):
        # JSON / 配列パラメータはJSON文字列として送る
        return json.dumps(p, ensure_ascii=False, default=_json_default)
    return p


class NeonClient:
    """Neon HTTP /sql エンドポイントの薄いラッパー"""

    def __init__(self, connection_string: str, timeout: int = 60):
        if not connection_string:
            raise ValueError("connection_string is required")
        parsed = urlparse(connection_string)
        if not parsed.hostname:
            raise ValueError(f"Invalid connection string: {connection_string!r}")

        self.connection_string = connection_string
        self.host = parsed.hostname
        self.url = f"https://{self.host}/sql"
        self.timeout = timeout

    def _request(self, query: str, params: Optional[list[Any]] = None) -> dict:
        body = {
            "query": query,
            "params": [_serialize_param(p) for p in (params or [])],
        }
        headers = {
            "Content-Type": "application/json",
            "Neon-Connection-String": self.connection_string,
            "Neon-Raw-Text-Output": "false",
            "Neon-Array-Mode": "false",
        }
        try:
            resp = requests.post(
                self.url,
                data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                headers=headers,
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise NeonError(f"HTTP request failed: {e}") from e

        if resp.status_code != 200:
            try:
                err = resp.json()
            except ValueError:
                err = {"raw": resp.text}
            raise NeonError(
                f"Neon API error ({resp.status_code}): "
                f"{err.get('message', err)}"
            )
        try:
            return resp.json()
        except ValueError as e:
            raise NeonError(f"Invalid JSON response: {resp.text[:200]}") from e

    def query(self, sql: str, params: Optional[list[Any]] = None) -> list[dict]:
        """SELECT等で行を返すクエリを実行し、行を辞書リストで返す"""
        result = self._request(sql, params)
        # Neon-Array-Mode: false の場合、rowsは {"col":"val"} の辞書リスト
        return result.get("rows", []) or []

    def execute(self, sql: str, params: Optional[list[Any]] = None) -> int:
        """INSERT/UPDATE/DELETE等の文を実行し、影響行数を返す"""
        result = self._request(sql, params)
        return int(result.get("rowCount", 0) or 0)

    def query_one(self, sql: str, params: Optional[list[Any]] = None) -> Optional[dict]:
        """1行だけ返すクエリ（見つからなければNone）"""
        rows = self.query(sql, params)
        return rows[0] if rows else None


def from_env(env_var: str = "DATABASE_URL") -> NeonClient:
    """環境変数から接続文字列を読んでクライアントを作る"""
    conn = os.environ.get(env_var)
    if not conn:
        raise NeonError(f"環境変数 {env_var} が設定されていません")
    return NeonClient(conn)
