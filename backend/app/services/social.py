"""Publicação direta nas redes sociais — tokens do dono colados nas Definições.

Padrão «bring your own token»: sem apps registadas não há OAuth, mas os tokens
de Página (Meta) e de membro (LinkedIn) publicam sozinhos:
- Facebook: Page token → POST /me/feed com link+mensagem
- Instagram: conta Business ligada a uma Página → media container + publish
  (precisa de uma imagem pública — logótipo/foto da página)
- LinkedIn: token com w_member_social → POST /v2/ugcPosts como pessoa

Tokens NUNCA são devolvidos ao cliente depois de gravados.
"""
from typing import Any, Optional

import httpx

GRAPH = "https://graph.facebook.com/v21.0"


async def fb_page_info(page_token: str) -> dict[str, Any]:
    """Valida o token e devolve {id, name} da Página (erro se inválido)."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{GRAPH}/me", params={"access_token": page_token, "fields": "id,name"})
    j = r.json()
    if r.status_code != 200 or "id" not in j:
        raise ValueError(j.get("error", {}).get("message", "Facebook respondeu com erro — token inválido ou sem permissão de Página."))
    return {"id": j["id"], "name": j.get("name", "")}


async def fb_post(page_token: str, link: str, message: str) -> str:
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(f"{GRAPH}/me/feed", data={"link": link, "message": message, "access_token": page_token})
    j = r.json()
    if r.status_code != 200 or "id" not in j:
        raise ValueError(j.get("error", {}).get("message", "Falha ao publicar no Facebook."))
    return f"https://www.facebook.com/{j['id']}"


async def ig_post(page_token: str, ig_user_id: str, image_url: str, caption: str) -> str:
    """Instagram Graph API: container → publish. exige conta Business ligada à Página."""
    async with httpx.AsyncClient(timeout=40) as client:
        c = await client.post(f"{GRAPH}/{ig_user_id}/media",
                              data={"image_url": image_url, "caption": caption, "access_token": page_token})
        cj = c.json()
        if c.status_code != 200 or "id" not in cj:
            raise ValueError(cj.get("error", {}).get("message", "Falha ao criar o post no Instagram (o teu site precisa de uma imagem pública e conta Business ligada à Página)."))
        p = await client.post(f"{GRAPH}/{ig_user_id}/media_publish",
                              data={"creation_id": cj["id"], "access_token": page_token})
        pj = p.json()
        if p.status_code != 200 or "id" not in pj:
            raise ValueError(pj.get("error", {}).get("message", "O Instagram recusou a publicação (conta Business? token com instagram_publish?)."))
    return f"https://www.instagram.com/p/{pj.get('permalink', pj['id'])}"


async def li_member_id(token: str) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get("https://api.linkedin.com/v2/me",
                             headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                             params={"projection": "(id,localizedFirstName)"})
    j = r.json()
    if r.status_code != 200 or "id" not in j:
        raise ValueError("LinkedIn não reconheceu o token — precisa da autorização «w_member_social» (Share on LinkedIn).")
    return str(j["id"])


async def li_post(token: str, author_urn: str, link: str, comment: str) -> str:
    body = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": comment},
                "shareMediaCategory": "ARTICLE",
                "media": [{"status": "READY", "url": link, "title": {"text": comment.splitlines()[0][:80]}}],
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post("https://api.linkedin.com/v2/ugcPosts",
                              headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                       "X-Restli-Protocol-Version": "2.0.0"},
                              json=body)
    j = r.json()
    if r.status_code not in (200, 201) or "id" not in j:
        detail = j.get("message") or j.get("error", {}).get("message") or "Falha ao publicar no LinkedIn."
        raise ValueError(str(detail))
    return f"https://www.linkedin.com/feed/"


def build_message(page_name: str, url: str) -> str:
    """Mensagem comum: nome da página como título e o link limpo por baixo."""
    return f"{page_name}\n{url}"


def pick_image(stored_page: dict[str, Any]) -> Optional[str]:
    """Primeira imagem pública da página (logótipo ou foto do cliente) — para o Instagram."""
    data = stored_page.get("data") or {}
    logo = data.get("logo") or {}
    if isinstance(logo, dict) and str(logo.get("url", "")).startswith("http"):
        return logo["url"]
    ctx = data.get("aiContext") or {}
    for src in ctx.get("contentSources") or []:
        if str(src).startswith("http"):
            return str(src)
    return None
