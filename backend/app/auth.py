"""Contas de utilizador — sem dependências novas (a imagem docker da cloud não instala pacotes).

Passwords: PBKDF2-HMAC-SHA256 (240k iterações, salt por utilizador).
Tokens: formato JWT HS256 assinado com hmac/hashlib do stdlib, 7 dias.
Chaves de API (Fase 3): guardadas só como hash SHA-256, mostradas uma vez.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from base64 import urlsafe_b64decode, urlsafe_b64encode
from typing import Optional

from . import config, db

PBKDF2_ITERS = 240_000
TOKEN_TTL = 7 * 24 * 3600  # 7 dias
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def _secret() -> bytes:
    """Segredo de assinatura por instalação: gerado na 1.ª execução e gravado no /data
    (sobrevive a restarts; tokens antigos ficam válidos). Nunca vai para git."""
    path = os.path.join(os.path.dirname(os.path.abspath(config.DB_PATH)), "auth.secret")
    if os.path.isfile(path):
        with open(path, "rb") as f:
            s = f.read()
        if len(s) >= 32:
            return s
    s = secrets.token_bytes(32)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(s)
    return s


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERS)
    return f"pbkdf2${PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def make_token(user: dict) -> str:
    header = urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=")
    payload = urlsafe_b64encode(json.dumps({
        "sub": user["id"], "email": user["email"], "name": user.get("name", ""),
        "exp": int(time.time()) + TOKEN_TTL,
    }).encode()).rstrip(b"=")
    signing = header + b"." + payload
    sig = urlsafe_b64encode(hmac.new(_secret(), signing, hashlib.sha256).digest()).rstrip(b"=")
    return (signing + b"." + sig).decode()


def read_token(token: str) -> Optional[dict]:
    """Valida assinatura + expiração; None = token inválido/velho."""
    try:
        h, p, s = token.split(".")
        expected = urlsafe_b64encode(hmac.new(_secret(), f"{h}.{p}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
        if not hmac.compare_digest(expected, s):
            return None
        data = json.loads(urlsafe_b64decode(p + "=" * (-len(p) % 4)))
        if int(data.get("exp", 0)) < time.time():
            return None
        return data
    except Exception:
        return None


# ─────────────────────────── tabela users ───────────────────────────


def init_auth_tables() -> None:
    with db._lock, db._conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
              pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS api_keys (
              id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, label TEXT NOT NULL,
              key_hash TEXT NOT NULL, prefix TEXT NOT NULL, created_at TEXT NOT NULL,
              FOREIGN KEY (owner_id) REFERENCES users(id)
            );
            """
        )


def create_user(email: str, password: str, name: str = "", role: str = "user") -> dict:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("Email inválido.")
    if len(password) < 8:
        raise ValueError("A palavra-passe tem de ter pelo menos 8 caracteres.")
    user = {
        "id": uuid.uuid4().hex, "email": email, "name": name.strip() or email.split("@")[0],
        "pass_hash": hash_password(password), "role": role,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        with db._lock, db._conn() as conn:
            conn.execute(
                "INSERT INTO users (id, email, name, pass_hash, role, created_at) VALUES (?,?,?,?,?,?)",
                (user["id"], user["email"], user["name"], user["pass_hash"], user["role"], user["created_at"]),
            )
    except sqlite3.IntegrityError:
        raise ValueError("Já existe uma conta com esse email.")
    return user


def get_user_by_email(email: str) -> Optional[dict]:
    with db._lock, db._conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    return dict(row) if row else None


def get_user(user_id: str) -> Optional[dict]:
    with db._lock, db._conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def user_count() -> int:
    with db._lock, db._conn() as conn:
        return conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]


def login(email: str, password: str) -> Optional[str]:
    """Devolve o token se as credenciais batem certo; None caso contrário."""
    user = get_user_by_email(email)
    if not user or not verify_password(password, user["pass_hash"]):
        return None
    return make_token(user)


def change_password(user_id: str, old_password: str, new_password: str) -> bool:
    """Troca a palavra-passe do dono. False se a atual nao bater."""
    user = get_user(user_id)
    if not user or not verify_password(old_password, user["pass_hash"]):
        return False
    with db._lock, db._conn() as conn:
        conn.execute("UPDATE users SET pass_hash = ? WHERE id = ?", (hash_password(new_password), user_id))
    return True


# ─────────────────────────── chaves de API (Fase 3) ───────────────────────────
# Formato la_<43 chars base64url>. Na BD guarda-se só o SHA-256: quem perde a
# chave cria outra; ninguém (nem nós) consegue lê-la de volta.


def create_api_key(owner_id: str, label: str) -> tuple[dict, str]:
    raw = "la_" + secrets.token_urlsafe(32)
    rec = {
        "id": uuid.uuid4().hex, "owner_id": owner_id, "label": label.strip()[:60] or "sem nome",
        "key_hash": hashlib.sha256(raw.encode()).hexdigest(),
        "prefix": raw[:11], "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with db._lock, db._conn() as conn:
        conn.execute(
            "INSERT INTO api_keys (id, owner_id, label, key_hash, prefix, created_at) VALUES (?,?,?,?,?,?)",
            (rec["id"], rec["owner_id"], rec["label"], rec["key_hash"], rec["prefix"], rec["created_at"]),
        )
    return rec, raw


def list_api_keys(owner_id: str) -> list[dict]:
    with db._lock, db._conn() as conn:
        rows = conn.execute(
            "SELECT id, label, prefix, created_at FROM api_keys WHERE owner_id=? ORDER BY created_at DESC",
            (owner_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_api_key(key_id: str, owner_id: str) -> bool:
    with db._lock, db._conn() as conn:
        cur = conn.execute("DELETE FROM api_keys WHERE id=? AND owner_id=?", (key_id, owner_id))
    return cur.rowcount > 0


def user_by_api_key(raw: str) -> Optional[dict]:
    """Chave crua → utilizador dono da chave; None se não bater com nenhum hash."""
    if not raw or not raw.startswith("la_"):
        return None
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    with db._lock, db._conn() as conn:
        row = conn.execute(
            "SELECT u.* FROM api_keys k JOIN users u ON u.id = k.owner_id WHERE k.key_hash=?",
            (key_hash,),
        ).fetchone()
    return dict(row) if row else None
