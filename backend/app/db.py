"""Persistência SQLite (stdlib, zero dependências).

Tabelas:
  pages(id)          — rascunhos/editáveis (o que o builder guarda)
  published(slug)    — a versão publicada servida publicamente + contador de visitas
  leads              — submissões de formulários, por slug
  image_cache(query) — fotos Pexels por query (1h) para não repetir chamadas

Em produção DB_PATH=/data/landing.db — sobrevive a restarts do processo.
"""
import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from . import config

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS published (
  slug TEXT PRIMARY KEY,
  page_id TEXT,
  name TEXT,
  data TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_slug ON leads(slug);
CREATE TABLE IF NOT EXISTS image_cache (
  query TEXT PRIMARY KEY,
  photos TEXT NOT NULL,
  cached_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_style (
  owner_id TEXT PRIMARY KEY,
  theme TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  page_id TEXT,
  digest TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_hist ON studio_history(owner_id);
CREATE TABLE IF NOT EXISTS social_tokens (
  owner_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  label TEXT,
  meta TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, platform)
);
CREATE TABLE IF NOT EXISTS webhooks (
  slug TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    import os
    folder = os.path.dirname(config.DB_PATH)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with _lock, _conn() as conn:
        conn.executescript(SCHEMA)
        # migração: bases antigas não têm dono — NULL = herança do tempo pré-contas
        for table in ("pages", "published"):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN owner_id TEXT")
            except sqlite3.OperationalError:
                pass  # coluna já existe


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _visible(owner_col: Optional[str], owner_id: str, is_admin: bool) -> bool:
    """Dono vê as suas; admin vê também as órfãs (criadas antes das contas)."""
    return owner_col == owner_id or (is_admin and owner_col is None)


# ─────────────────────────── pages ───────────────────────────


def save_page(page: dict[str, Any], owner_id: Optional[str] = None) -> None:
    now = _now()
    # datas viajam no documento: sem isto o dashboard mostra «1970» (Date(0))
    page = {**page, "updatedAt": now, "createdAt": page.get("createdAt") or now}
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO pages(id, data, updated_at, owner_id) VALUES(?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
            (page["id"], json.dumps(page, ensure_ascii=False), now, owner_id),
        )


def get_page(page_id: str) -> Optional[dict[str, Any]]:
    with _conn() as conn:
        row = conn.execute("SELECT data, owner_id FROM pages WHERE id=?", (page_id,)).fetchone()
    return json.loads(row["data"]) if row else None


def page_owner(page_id: str) -> tuple[bool, Optional[str]]:
    """(existe, dono) — o route decide 404 vs 403."""
    with _conn() as conn:
        row = conn.execute("SELECT owner_id FROM pages WHERE id=?", (page_id,)).fetchone()
    return (True, row["owner_id"]) if row else (False, None)


def list_pages(owner_id: Optional[str] = None, is_admin: bool = False) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT data, owner_id, updated_at FROM pages ORDER BY updated_at DESC").fetchall()
        # backfill slug publicado: páginas gravadas antes do campo publishedSlug
        # voltam a ter o link através do registo de publicação (fonte da verdade)
        slugs = {r["page_id"]: r["slug"] for r in conn.execute("SELECT page_id, slug FROM published WHERE page_id IS NOT NULL")}
    out = []
    for r in rows:
        if owner_id is not None and not _visible(r["owner_id"], owner_id, is_admin):
            continue
        page = json.loads(r["data"])
        if page.get("id") in slugs and not page.get("publishedSlug"):
            page["publishedSlug"] = slugs[page["id"]]
        # datas antigas (gravadas antes do campo) vêm da coluna — senão a UI lê Date(0)=1970
        page["updatedAt"] = page.get("updatedAt") or r["updated_at"]
        page["createdAt"] = page.get("createdAt") or r["updated_at"]
        out.append(page)
    return out


def delete_page(page_id: str) -> None:
    with _lock, _conn() as conn:
        conn.execute("DELETE FROM pages WHERE id=?", (page_id,))


# ─────────────────────────── publicadas ───────────────────────────


# ───────────────────────── estilo do utilizador ──────────────────────────

# ──────────────────── studio history (anti-repetição) ────────────────────

def record_studio(owner_id: str, page_id: str, digest: dict) -> None:
    """Guarda o resumo visual de uma página studio do dono (para não repetir)."""
    if not owner_id or not isinstance(digest, dict):
        return
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO studio_history(owner_id, page_id, digest, created_at) VALUES(?,?,?,?)",
            (owner_id, page_id, json.dumps(digest, ensure_ascii=False), _now()),
        )

def recent_studio_digests(owner_id: str, limit: int = 3) -> list[dict]:
    """Últimas vistas do dono — input do bloco ANTI-REPETIÇÃO do design."""
    if not owner_id:
        return []
    with _conn() as conn:
        rows = conn.execute(
            "SELECT digest FROM studio_history WHERE owner_id=? ORDER BY id DESC LIMIT?",
            (owner_id, max(1, min(limit, 5))),
        ).fetchall()
    return [json.loads(r[0]) for r in rows]

def save_user_style(owner_id: str, theme: dict) -> None:
    """Último tema usado pelo dono — cada página nova parte daqui."""
    if not owner_id or not isinstance(theme, dict) or not theme:
        return
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO user_style(owner_id, theme, updated_at) VALUES(?,?,?) "
            "ON CONFLICT(owner_id) DO UPDATE SET theme=excluded.theme, updated_at=excluded.updated_at",
            (owner_id, json.dumps(theme, ensure_ascii=False), _now()),
        )


def get_user_style(owner_id: str) -> Optional[dict]:
    if not owner_id:
        return None
    with _conn() as conn:
        row = conn.execute("SELECT theme FROM user_style WHERE owner_id=?", (owner_id,)).fetchone()
    return json.loads(row["theme"]) if row else None


def publish_page(slug: str, page: dict[str, Any], owner_id: Optional[str] = None) -> None:
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO published(slug, page_id, name, data, visits, published_at, owner_id) VALUES(?,?,?,?,0,?,?) "
            "ON CONFLICT(slug) DO UPDATE SET page_id=excluded.page_id, name=excluded.name, data=excluded.data",
            (slug, page.get("id", ""), page.get("name", ""), json.dumps(page, ensure_ascii=False), _now(), owner_id),
        )


def published_owner(slug: str) -> tuple[bool, Optional[str]]:
    """(existe, dono) de uma página publicada."""
    with _conn() as conn:
        row = conn.execute("SELECT owner_id FROM published WHERE slug=?", (slug,)).fetchone()
    return (True, row["owner_id"]) if row else (False, None)


def unpublish_page(slug: str) -> None:
    with _lock, _conn() as conn:
        conn.execute("DELETE FROM published WHERE slug=?", (slug,))
        conn.execute("DELETE FROM leads WHERE slug=?", (slug,))


def slugs_of_page(page_id: str) -> list[str]:
    """Slugs publicados que vieram desta página (apagar a página tira-os do ar)."""
    with _conn() as conn:
        rows = conn.execute("SELECT slug FROM published WHERE page_id=?", (page_id,)).fetchall()
    return [r["slug"] for r in rows]


def get_published(slug: str) -> Optional[dict[str, Any]]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM published WHERE slug=?", (slug,)).fetchone()
    if not row:
        return None
    return {"slug": row["slug"], "name": row["name"], "visits": row["visits"], "publishedAt": row["published_at"], "page": json.loads(row["data"])}


def list_published(owner_id: Optional[str] = None, is_admin: bool = False) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT slug, name, visits, published_at, owner_id, page_id FROM published ORDER BY published_at DESC").fetchall()
    rows = [r for r in rows if owner_id is None or _visible(r["owner_id"], owner_id, is_admin)]
    return [{"slug": r["slug"], "name": r["name"], "visits": r["visits"], "publishedAt": r["published_at"], "pageId": r["page_id"]} for r in rows]


def slugs_of(owner_id: str, is_admin: bool) -> set[str]:
    """Slugs visíveis para esta conta — usado para filtrar leads."""
    with _conn() as conn:
        rows = conn.execute("SELECT slug, owner_id FROM published").fetchall()
    return {r["slug"] for r in rows if _visible(r["owner_id"], owner_id, is_admin)}


def count_published_leads(slug: str) -> int:
    with _conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM leads WHERE slug=?", (slug,)).fetchone()
    return int(row["n"])


def add_visit(slug: str) -> Optional[int]:
    with _lock, _conn() as conn:
        cur = conn.execute("UPDATE published SET visits = visits + 1 WHERE slug=?", (slug,))
        if cur.rowcount == 0:
            return None
        row = conn.execute("SELECT visits FROM published WHERE slug=?", (slug,)).fetchone()
    return int(row["visits"]) if row else None


# ─────────────────────────── leads ───────────────────────────


def add_lead(slug: str, lead: dict[str, Any]) -> str:
    """Grava o lead e devolve o created_at (o webhook precisa dele igual ao guardado)."""
    ts = _now()
    with _lock, _conn() as conn:
        conn.execute("INSERT INTO leads(slug, created_at, data) VALUES(?,?,?)",
                     (slug, ts, json.dumps(lead, ensure_ascii=False)))
    return ts


def get_leads(slug: Optional[str] = None) -> list[dict[str, Any]]:
    sql = "SELECT slug, created_at, data FROM leads"
    args: tuple = ()
    if slug:
        sql += " WHERE slug=?"
        args = (slug,)
    sql += " ORDER BY id DESC"
    with _conn() as conn:
        rows = conn.execute(sql, args).fetchall()
    out = []
    for r in rows:
        item = json.loads(r["data"])
        item["_slug"] = r["slug"]
        item["_createdAt"] = r["created_at"]
        out.append(item)
    return out


# ─────────────────────────── webhooks por página ───────────────────────────


def set_webhook(slug: str, owner_id: str, url: str, secret: str) -> None:
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO webhooks(slug, owner_id, url, secret, created_at) VALUES(?,?,?,?,?) "
            "ON CONFLICT(slug) DO UPDATE SET url=excluded.url, secret=excluded.secret",
            (slug, owner_id, url, secret, _now()),
        )


def get_webhook(slug: str) -> Optional[dict[str, Any]]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM webhooks WHERE slug=?", (slug,)).fetchone()
    return dict(row) if row else None


def list_webhooks(owner_id: str, is_admin: bool) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT slug, owner_id, url, created_at FROM webhooks").fetchall()
    return [{"slug": r["slug"], "url": r["url"], "createdAt": r["created_at"]}
            for r in rows if _visible(r["owner_id"], owner_id, is_admin)]


def delete_webhook(slug: str) -> bool:
    """O route valida dono primeiro (_check_slug_owner); aqui apaga-se por slug."""
    with _lock, _conn() as conn:
        cur = conn.execute("DELETE FROM webhooks WHERE slug=?", (slug,))
    return cur.rowcount > 0


# ─────────────────────────── cache de imagens ───────────────────────────


def cache_get(query: str) -> Optional[list[dict[str, str]]]:
    with _conn() as conn:
        row = conn.execute("SELECT photos, cached_at FROM image_cache WHERE query=?", (query,)).fetchone()
    if not row:
        return None
    ts = datetime.fromisoformat(row["cached_at"])
    if (datetime.now(timezone.utc) - ts).total_seconds() > 3600:
        return None
    return json.loads(row["photos"])


def cache_put(query: str, photos: list[dict[str, str]]) -> None:
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO image_cache(query, photos, cached_at) VALUES(?,?,?) "
            "ON CONFLICT(query) DO UPDATE SET photos=excluded.photos, cached_at=excluded.cached_at",
            (query, json.dumps(photos, ensure_ascii=False), _now()),
        )


def set_social_token(owner_id: str, platform: str, token: str, label: str = "", meta: str = "") -> None:
    from datetime import datetime, timezone
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO social_tokens(owner_id, platform, token, label, meta, updated_at) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(owner_id, platform) DO UPDATE SET token=excluded.token, label=excluded.label, "
            "meta=excluded.meta, updated_at=excluded.updated_at",
            (owner_id, platform, token, label, meta, datetime.now(timezone.utc).isoformat()),
        )


def get_social_token(owner_id: str, platform: str) -> Optional[dict[str, Any]]:
    with _conn() as conn:
        r = conn.execute("SELECT * FROM social_tokens WHERE owner_id=? AND platform=?", (owner_id, platform)).fetchone()
    return dict(r) if r else None


def list_social_tokens(owner_id: str) -> list[dict[str, Any]]:
    """Nunca expor o token cru: só plataforma, rótulo e meta."""
    with _conn() as conn:
        rows = conn.execute("SELECT platform, label, meta, updated_at FROM social_tokens WHERE owner_id=?", (owner_id,)).fetchall()
    return [dict(r) for r in rows]


def delete_social_token(owner_id: str, platform: str) -> bool:
    with _lock, _conn() as conn:
        cur = conn.execute("DELETE FROM social_tokens WHERE owner_id=? AND platform=?", (owner_id, platform))
    return cur.rowcount > 0

