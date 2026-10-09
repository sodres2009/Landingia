"""Entrega de webhooks — POST JSON assinado HMAC-SHA256 por lead novo.

O destino verifica com o secret mostrado uma vez no Settings:
    expected = "sha256=" + hmac_sha256(secret, raw_body).hexdigest()
    ok = hmac.compare_digest(expected, header["X-Landing-Signature"])

Body (mesmo contrato do GET /crm/v1/leads, embrulhado no evento):
    {"event": "lead.created", "sentAt": iso, "lead": {slug, page, sectionId,
     elementId, values, createdAt}}

Falhar é silencioso por desenho: o lead já está na BD e fica disponível no
pull /crm/v1/leads — o webhook é conveniência, nunca bloqueia o formulário.
"""
import hashlib
import hmac
import json
import time

import httpx

ATTEMPTS = 3  # 1 entrega + 2 retries
BACKOFF = (2.0, 5.0)  # segundos entre tentativas


def signature(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def lead_event(slug: str, page_name: str, lead: dict, created_at: str) -> dict:
    return {
        "event": "lead.created",
        "sentAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lead": {
            "slug": slug, "page": page_name,
            "sectionId": lead.get("sectionId"), "elementId": lead.get("elementId"),
            "values": lead.get("values") or {}, "createdAt": created_at,
        },
    }


def deliver(url: str, secret: str, event: dict, *, post=None, sleep=None) -> bool:
    """Verdade = entregue (2xx/3xx). Nunca lança — o chamador é background."""
    post = post or httpx.post
    sleep = sleep or time.sleep
    body = json.dumps(event, ensure_ascii=False).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Landing-Signature": signature(secret, body),
        "X-Landing-Event": "lead.created",
    }
    for attempt in range(ATTEMPTS):
        try:
            res = post(url, content=body, headers=headers, timeout=8.0)
            if res.status_code < 400:
                return True
        except Exception:
            pass
        if attempt + 1 < ATTEMPTS:
            sleep(BACKOFF[attempt])
    return False
