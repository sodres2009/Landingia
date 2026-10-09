"""Lê o site do cliente quando o briefing cita URL: informação + cores reais da marca.

O cliente que dá o site diz «faz igual ao meu» — o agente herda as cores e usa
factos reais da homepage em vez de inventar. Nada aqui bloqueia: falha = None.
"""
import re
from typing import Optional

import httpx

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}

_URL_RE = re.compile(
    # whitelist antiga (pt|com|…) deixava de fora .co.mz/.co.ao/.fr/… — o cliente
    # moçambicano dava "sem site" e o agente não lia nada. Qualquer TLD real serve.
    r"(?:https?://)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*"
    r"\.[a-z]{2,6}(?:/[^\s,;)\"']*)?",
    re.IGNORECASE,
)
_HEX_RE = re.compile(r"#([0-9a-fA-F]{6})\b|#([0-9a-fA-F]{3})\b")
_META_DESC = re.compile("""<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,})""", re.I)
_OG_DESC = re.compile("""<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,})""", re.I)
_TITLE_RE = re.compile(r"(?is)<title[^>]*>(.*?)</title>")
_CSS_LINK = re.compile(r"<link[^>]+stylesheet[^>]+href=[^a-zA-Z0-9]*([a-zA-Z0-9_./?=&%-]+)", re.I)
_VENDOR_CSS = re.compile(r"bootstrap|flaticon|fontawesome|fa-|mega|swiper|slick|animate|vendor|normalize", re.I)
_OG_IMAGE = re.compile("""<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']""", re.I)
_IMG_SRC = re.compile("""<img[^>]+src=["']([^"']+)["']""", re.I)
_IMG_JUNK = re.compile(r"(?i)logo|icon|sprite|avatar|flag|placeholder|pixel|spacer|spinner|\.svg\b|1x1|blank|loader|\.gif\b|facebook\.com|analytics|\btrack|phone|whatsapp|\bmail|map-marker|\bbtn\b")


def _site_images(base_url: str, html: str, limit: int = 10) -> list[str]:
    """Fotos de conteúdo do site (viaturas, espaço, equipa) — o cliente que dá o
    site quer as fotos DELE na landing. Logos/ícones/svg ficam de fora."""
    raw: list[str] = []
    og = _OG_IMAGE.search(html)
    if og:
        raw.append(og.group(1))
    raw += _IMG_SRC.findall(html)
    out: list[str] = []
    for src in raw:
        src = src.strip()
        if not src or src.startswith(("data:", "blob:")) or _IMG_JUNK.search(src):
            continue
        try:
            absolute = str(httpx.URL(base_url).join(src))
        except Exception:
            continue
        if not absolute.startswith("http") or absolute in out:
            continue
        out.append(absolute)
        if len(out) >= limit:
            break
    return out


def normalize_url(text: str) -> Optional[str]:
    """Primeiro URL legível num texto de briefing → https://… (ou None)."""
    m = _URL_RE.search(text)
    if not m:
        return None
    url = m.group(0).rstrip(".")
    return url if url.startswith("http") else "https://" + url


def _strip(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?s)<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def _chromatic(hx: str) -> bool:
    """Filtrar preto/branco/cinza: só conta cor de marca."""
    d = hx[1:]
    if len(d) == 3:
        d = "".join(c * 2 for c in d)
    r, g, b = int(d[0:2], 16), int(d[2:4], 16), int(d[4:6], 16)
    return max(r, g, b) - min(r, g, b) > 28


async def fetch_site(url: str, keep_html: bool = False) -> Optional[dict]:
    """Homepage do cliente → {title, description, colors[6], text[:1200]} ou None."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0), headers=UA, follow_redirects=True) as client:
            res = await client.get(url)
            if res.status_code != 200 or len(res.text) < 400:
                return None
            html = res.text[:400_000]
            # as cores da marca vivem no CSS próprio: apanha os stylesheets não-vendor
            hrefs = sorted((h for h in _CSS_LINK.findall(html) if not _VENDOR_CSS.search(h)), key=lambda h: 0 if re.search(r"custom|main|theme|dsauto|style|responsive", h, re.I) else 1)[:4]
            for href in hrefs:
                try:
                    css = (await client.get(str(httpx.URL(url).join(href)))).text[:200_000]
                    if css.lstrip()[:1] == "<":
                        continue  # soft-404: o servidor devolve HTML disfarçado
                    html += "\n" + css
                except Exception:
                    pass
        counts: dict[str, int] = {}
        for a, b in _HEX_RE.findall(html):
            k = ("#" + (a or b)).lower()
            counts[k] = counts.get(k, 0) + 1
        colors = [k for k, _ in sorted(counts.items(), key=lambda kv: -kv[1]) if _chromatic(k)][:6]
        title = _TITLE_RE.search(html)
        desc = _META_DESC.search(html) or _OG_DESC.search(html)
        text = _strip(html)[:1200]
        if not text:
            return None
        return {
            "title": (re.sub(r"\s+", " ", title.group(1)).strip()[:160] if title else ""),
            "description": (desc.group(1).strip()[:300] if desc else ""),
            "colors": colors,
            "text": text,
            "url": url,
            "images": _site_images(url, res.text[:400_000]),
            **({"html": res.text[:400_000]} if keep_html else {}),
        }
    except Exception:
        return None


_HINT_LINK = re.compile(
    r"(?i)viatura|carro|frota|fleet|galeria|galer|gallery|servic|pre[cç]o|price|tabela|"
    r"modelo|stand|equipa|team|contact|produto|product|menu|oferta|deal")
_BAD_LINK = re.compile(
    r"(?i)\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|ico|css|js)(\?|#|$)|facebook\.|instagram\.|"
    r"twitter\.|x\.com|linkedin\.|youtube\.|tiktok\.|whatsapp\.|#|mailto:|tel:|politica|"
    r"privacidade|termos|cookies|rss|login|logout|registo|carrinho|checkout|search|\?s=|"
    r"\bcategoria\b|\btag\b|/blog/|/news/|impress|job|vaga")


async def _inner_page(client: httpx.AsyncClient, url: str) -> Optional[dict]:
    """Página interior → {url, title, text, images} ou None (falha nunca bloqueia)."""
    try:
        res = await client.get(url)
        if res.status_code != 200 or len(res.text) < 300:
            return None
        html = res.text[:400_000]
        t = _TITLE_RE.search(html)
        return {
            "url": url,
            "title": (re.sub(r"\s+", " ", t.group(1)).strip()[:120] if t else ""),
            "text": _strip(html)[:500],
            "images": _site_images(url, html, 12),
        }
    except Exception:
        return None


async def crawl_site(url: str, max_extra: int = 3) -> Optional[dict]:
    """O «navegar» do agente: homepage + até 3 páginas interiores relevantes.

    O modelo não navega sites — isto lê a página principal, escolhe os links de
    maior afinidade de conteúdo (viaturas, galeria, serviços…) e agrega fotos e
    factos de todo o site. Fotos ranqueadas: páginas de conteúdo primeiro,
    homepage depois. Nada aqui bloqueia a criação: falha = homepage ou None.
    """
    home = await fetch_site(url, keep_html=True)
    if not home:
        return None
    html = home.pop("html", "")
    host = httpx.URL(url).host.removeprefix("www.")
    picks: list[tuple[int, str]] = []
    seen: set[str] = set()
    for h in re.findall(r"""href=["']([^"']+)["']""", html):
        if not h or _BAD_LINK.search(h):
            continue
        try:
            u = httpx.URL(url).join(h)
        except Exception:
            continue
        if u.scheme not in ("http", "https") or u.host.removeprefix("www.") != host:
            continue
        key = str(u).split("#")[0].rstrip("/")
        path = u.path or "/"
        if not key or key in seen or key == str(httpx.URL(url)).rstrip("/") or path == "/":
            continue
        seen.add(key)
        score = 3 if _HINT_LINK.search(path) else 0
        score += 1 if path.count("/") <= 2 else 0
        picks.append((score, key))
    picks.sort(key=lambda p: -p[0])
    pages: list[dict] = []
    if picks:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=5.0), headers=UA,
                                         follow_redirects=True) as client:
                for _, purl in picks[:max_extra]:
                    pg = await _inner_page(client, purl)
                    if pg:
                        pages.append(pg)
        except Exception:
            pass
    ranked: list[str] = []
    for pg in pages:               # fotos das páginas de conteúdo primeiro
        for u in pg["images"]:
            if u not in ranked:
                ranked.append(u)
    for u in home["images"]:        # homepage a fechar (og/logo-ish por último)
        if u not in ranked:
            ranked.append(u)
    home["pages"] = pages
    home["images"] = ranked[:14]
    return home
