"""Serviço de imagens — Pexels (chave opcional) + Openverse + catálogo curado.

Zero LoremFlickr: as fotos são reais. Sem chave de API usa-se o Openverse
(agrega Flickr/Wikimedia e mais, ~800M imagens, sem registo). Cache em
SQLite por query (1h) para respeitar rate limits.
"""
import random
import re
import unicodedata
from typing import Optional
from urllib.parse import quote_plus

import httpx
from urllib.parse import quote_plus, quote, urlsplit, urlunsplit

from .. import config, db

STOP = {
    "landing", "pagina", "page", "quero", "preciso", "gostaria", "para", "com",
    "uma", "um", "uns", "umas", "meu", "minha", "site", "criar", "fazer", "pago",
    "negocio", "empresa", "cliente", "pessoas", "desta", "deste", "tipo", "online",
    "internet", "muito", "mais", "como", "this", "that", "with", "from", "foto",
    "imagem", "fotos", "imagens", "muda", "mudar", "troca", "trocar", "coloca",
    "colocar", "queres", "poe", "pôr",
}

PT_EN = {
    "carros": "car", "carro": "car", "viaturas": "car", "viatura": "car", "automovel": "car",
    "stand": "car dealership", "stands": "car dealership", "showroom": "car showroom", "seminovos": "used cars",
    "oficina": "car repair mechanic", "oficinas": "car repair mechanic",
    "populares": "compact hatchback", "economicos": "economy car", "citadinos": "city car", "familiares": "family car",
    "casas": "house", "casa": "house", "apartamento": "apartment", "moradia": "house", "quartos": "room", "quarto": "room",
    "cozinha": "kitchen", "comida": "food", "prato": "food", "restaurante": "restaurant",
    "roupas": "fashion", "roupa": "fashion", "loja": "shop", "vendas": "retail", "venda": "retail",
    "produto": "product", "produtos": "product", "equipa": "team", "reunioes": "meeting", "reuniao": "meeting",
    "escola": "school", "cursos": "course", "curso": "course", "aulas": "class", "aula": "class", "alunos": "students",
    "clinica": "clinic", "saude": "health", "dentista": "dentist", "medicos": "doctor", "medico": "doctor",
    "eventos": "event", "evento": "event", "conferencia": "conference", "festa": "party", "festival": "festival",
    "viagem": "travel", "viagens": "travel", "ferias": "vacation", "hotel": "hotel", "praia": "beach",
    "jardim": "garden", "plantas": "plant", "animais": "dog", "cao": "dog",
    "bebidas": "drink", "cafe": "coffee", "vinhos": "wine", "vinho": "wine",
    "tecnologia": "technology", "software": "software", "aplicacao": "app", "app": "app",
    "marketing": "marketing", "design": "design", "construcao": "construction", "obras": "construction",
    "limpeza": "cleaning", "servicos": "service", "servico": "service", "industria": "industry",
    "fabrica": "factory", "desporto": "sport", "treino": "training", "treinos": "training",
    "musica": "music", "fotografia": "photography", "foto": "photo", "fotos": "photo",
    "cabelo": "hair", "barbearia": "barber", "beleza": "beauty", "estetica": "beauty", "unhas": "nails",
    "pets": "pet", "veterinario": "veterinary", "jiujitsu": "jiu jitsu", "jiu jitsu": "jiu jitsu",
    "judô": "judo", "yoga": "yoga", "ginásio": "gym", "ginasio": "gym", "academia": "gym training",
}

CATALOG: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r"carros?|automov|viatura|stand\b|seminov|motas?|oficina|conduz|estrada", re.I),
     ["photo-1503376780353-7e6692767b70", "photo-1494976388531-d1058494cdd8", "photo-1552519507-da3b142c6e3d", "photo-1583121274602-3e2820c69888", "photo-1568605114967-6877f6fbb38b"]),
    (re.compile(r"imove|casas?|apartamento|moradia|habita|arrendamento|quartos?|imobili", re.I),
     ["photo-1560448204-e02f11c3d0e2", "photo-1512917774080-9991f1c4c750", "photo-1600585154340-be6161a56a0c", "photo-1600607687939-ce8a6c25118c", "photo-1613490493576-7fde63acd811"]),
    (re.compile(r"restaurante|comida|gastronom|chef|menu|pizza|sushi|marisco|caf[eé]|petisco|jantar|cozinha", re.I),
     ["photo-1517248135467-4c7edcad34c4", "photo-1414235077428-338989a2e8c0", "photo-1504674900247-0877df9cc836", "photo-1540189549337-e28fa8b5a4fa"]),
    (re.compile(r"moda|roupas?|vestuar|textil|calcad|acessorios|estilo|coleca", re.I),
     ["photo-1483985988355-763728e1935b", "photo-1490481651871-ab68de25d43d", "photo-1469334031218-e382a71b716b", "photo-1441984904996-e0b6ba687e04"]),
    (re.compile(r"jiu|jjp|kimono|artes? marciais|gimnas|ginasio|fitness|treino|crossfit|yoga|desporto|lut[ao]?s?\b", re.I),
     ["photo-1555597673-d7bb05a2669a", "photo-1552072445-94acd5d2ce64", "photo-1571019613454-1cb2f99b2d8b", "photo-1517438322307-f6335c6bc413", "photo-1571902943202-507ec2618e8e"]),
    (re.compile(r"viagens?|travel|tour|f[eé]rias|hotel|resort|excursa|destinos?|paisagem", re.I),
     ["photo-1488646953014-85cb44e25828", "photo-1469854523086-cc02fe5d8800", "photo-1507525428034-b72313b1b68e", "photo-1476514525535-07fb3b4ae5f1"]),
    (re.compile(r"cursos?|formac|escola|educa|aulas?|masterclass|academia|alunos?|estudante", re.I),
     ["photo-1523050854058-8df90110c9f1", "photo-1509062522246-3755977927d7", "photo-1522202176988-66273c2fd55f", "photo-1524178232363-1fb2b075b655"]),
    (re.compile(r"clinica|saude|dentista|medic|fisioterapia|bem-?estar|terapia|cuidados", re.I),
     ["photo-1576091160399-112ba8d2588f", "photo-1579684385127-1ef15d508118"]),
    (re.compile(r"evento|confer|palestra|audit|plateia|network|encontro|workshop|semin", re.I),
     ["photo-1540575467063-178a50c2df87", "photo-1515169067868-5387ec356754", "photo-1505373877841-8d25f7d46678", "photo-1511578312907-e13cbde1a617"]),
    (re.compile(r"ia\b|intelig|tecnolog|software|digital|dados|robo|automatiz|app\b|plataforma|saas", re.I),
     ["photo-1518770660439-4636190af475", "photo-1485827404703-89b55fcc595e", "photo-1531746790731-6c087fecd65a", "photo-1550751827-4bd374c3f58b"]),
    (re.compile(r"equipa|team|reuni|escritor?io|negocio|business|corporativ|limpez|contabil|consultor|advogad", re.I),
     ["photo-1556761175-b413da4baf72", "photo-1521737711867-e3b97375f902", "photo-1517048676732-d65bc937f952", "photo-1497366754035-f200968a6e72", "photo-1497366811353-6870744d04b2"]),
    (re.compile(r"produto|loja|ecommerce|venda|packaging|retail|comercio", re.I),
     ["photo-1441986300917-64674bd600d8", "photo-1556742049-0cfed4f6a45d", "photo-1472851294608-062f824d29cc", "photo-1566576912321-d58dc7bc7957"]),
    (re.compile(r"barbear|barbeiro|cabeleireir|cabelo|corte|penteado|salao|estetic|beleza|manicura|pedicura|unhas|maquilh", re.I),
     ["photo-1503951914875-452162b0f3f1", "photo-1585747860715-2ba37e788b70"]),
]

FALLBACK_PHOTOS = CATALOG[10][1]
ROLE_HINTS = {
    "hero": "happy lifestyle people",
    "benefits": "work service team action",
    "problem": "work service team action",
    "social": "people smiling trust hands",
    "proof": "people smiling trust hands",
    "cta": "office desk handshake meeting",
    "form": "office desk meeting laptop",
}


def _unsplash(photo: str) -> str:
    return f"https://images.unsplash.com/{photo}?auto=format&fit=crop&w=1600&q=85"


def slug_words(query: str, max_words: int = 4) -> str:
    decomposed = unicodedata.normalize("NFD", (query or "").lower())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    words = re.sub(r"[^a-z0-9\s]", " ", stripped)
    parts = [w for w in words.split() if len(w) > 2 and w not in STOP]
    en: list[str] = []
    for w in parts:
        t = PT_EN.get(w, w)
        if t not in en:
            en.append(t)
        if len(en) >= max_words:
            break
    return " ".join(en)


def _curated_match(query: str, exclude: list[str], seed: int) -> dict | None:
    """Foto curada SÓ se o padrão do catálogo bater no pedido (senão None)."""
    for pattern, photos in CATALOG:
        if pattern.search(query or ""):
            urls = [_unsplash(p) for p in photos]
            available = [u for u in urls if u not in exclude]
            pool = available or urls
            return {"url": pool[abs(seed) % len(pool)], "alt": "", "source": "curated"}
    return None


def _curated(query: str, exclude: list[str], seed: int) -> dict:
    hit = _curated_match(query, exclude, seed)
    if hit:
        return hit
    urls = [_unsplash(p) for p in FALLBACK_PHOTOS]
    return {"url": urls[abs(seed) % len(urls)], "alt": "", "source": "curated"}


async def generate_image(prompt: str) -> dict | None:
    """Último recurso: IA desenha exatamente o que foi pedido (Pollinations, grátis).

    «Quero uma foto do nosso salão com mesas postas» sem foto real = gerar uma
    que representa o pedido — melhor do que foto aleatória sem noção.
    """
    clean = re.sub(r"[^a-zA-Z0-9\s,.-]", "", (prompt or ""))[:180].strip()
    if len(clean) < 10:
        return None
    url = f"https://image.pollinations.ai/prompt/{quote_plus(clean)}?width=1280&height=800&nologo=true"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(75.0, connect=10.0)) as client:
            res = await client.head(url)
            if res.status_code == 200 and str(res.headers.get("content-type", "")).startswith("image"):
                return {"url": url, "alt": clean[:120], "source": "ai"}
    except Exception:
        return None
    return None


_pexels_key_dead = False


async def pexels_search(query: str, count: int = 8) -> list[dict]:
    global _pexels_key_dead
    key = config.PEXELS_API_KEY
    if not key or not query or _pexels_key_dead:
        return []
    cached = db.cache_get(query.lower())
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
            res = await client.get(
                "https://api.pexels.com/v1/search",
                params={"query": query, "per_page": str(min(count, 15)), "size": "large", "orientation": "landscape"},
                headers={"Authorization": key},
            )
            if res.status_code == 401:
                # chave inválida: parar de a bater até ao restart (poupa 20s por foto)
                _pexels_key_dead = True
                return []
            if res.status_code != 200:
                return []
            photos = [{
                "url": p.get("src", {}).get("large2x") or p.get("src", {}).get("large") or "",
                "alt": (p.get("alt") or query).strip(),
            } for p in res.json().get("photos", [])]
            photos = [p for p in photos if p["url"].startswith("http")]
            if photos:
                db.cache_put(query.lower(), photos)
            return photos
    except Exception:
        return []


async def openverse_search(query: str, count: int = 10, page: int = 1) -> list[dict]:
    """Fotos reais SEM chave de API (Flickr/Wikimedia/…, apenas licença comercial)."""
    if not query:
        return []
    key = f"ov:{query.lower()}:{page}"
    cached = db.cache_get(key)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0)) as client:
            res = await client.get(
                "https://api.openverse.org/v1/images/",
                params={"q": query, "page_size": str(min(count, 20)), "page": str(page),
                        "mature": "false", "license_type": "commercial", "_meta": "license"},
            )
            if res.status_code != 200:
                return []
            photos = []
            for p in res.json().get("results", []):
                url = p.get("url") or p.get("thumbnail") or ""
                # só JPEG/PNG diretos; SVG/GIF servem mal num landing
                if not url.startswith("http") or url.lower().split("?")[0].endswith((".svg", ".gif", ".tif", ".tiff")):
                    continue
                photos.append({"url": url, "alt": (p.get("title") or query).strip()[:120]})
            if photos:
                db.cache_put(key, photos)
            return photos
    except Exception:
        return []


def _available(found: list[dict], exclude: list[str]) -> list[dict]:
    return [p for p in found if p["url"] not in exclude]


def _safe_url(url: str) -> str:
    """URLs do Openverse/Flickr trazem espaços e acentos crus — <img src> partido
    mostra a foto de fundo da secção «atrás». Percent-encode do path e query."""
    try:
        parts = urlsplit(url)
        return urlunsplit((parts.scheme, parts.netloc, quote(parts.path), quote(parts.query, safe="=&?"), parts.fragment))
    except Exception:
        return url


def _relevant(qwords: set[str], found: list[dict]) -> list[dict]:
    """Só vale foto cujo título/alt cita o pedido — Pexels E Openverse.

    Sem sobreposição de palavras, é melhor cair no catálogo curado (ou gerar)
    do que colar cegonha num telhado numa página de moda.
    """
    if not qwords:
        return found
    out = []
    for p in found:
        words = {w for w in re.split(r"[^a-z0-9]+", str(p.get("alt") or "").lower()) if len(w) > 3}
        if qwords & words:
            out.append(p)
    return out


def _qwords(query: str) -> set[str]:
    return {w for w in re.sub(r"[^a-z0-9\s]", " ", (query or "").lower()).split() if len(w) > 3}


async def _search_more(query: str) -> tuple[list[dict], str, str]:
    """Pexels (PT e EN) → Openverse. Devolve também a query que surtiu efeito,
    para o portão de relevância comparar contra o alt no idioma certo."""
    q = query or "business meeting"
    found = await pexels_search(q)
    if found:
        return found, "pexels", q
    en = slug_words(q)
    if en and en.lower() != q.lower():
        found = await pexels_search(en)
        if found:
            return found, "pexels", en
    found = await openverse_search(q)
    return found, "openverse", q


async def _pick_fresh(query: str, exclude: list[str]) -> dict | None:
    """Escolhe uma foto RELEVANTE que ainda não esteja na página; repagina se preciso."""
    found, source, eff_q = await _search_more(query)
    if found:
        found = _relevant(_qwords(query) | _qwords(eff_q), found)
    if not found:
        return None
    avail = _available(found, exclude)
    if not avail:
        found2 = await openverse_search(query or "business meeting", count=20, page=2)
        found2 = _relevant(_qwords(query), found2)
        avail, source = _available(found2, exclude), "openverse"
    if not avail:
        return None
    pick = random.choice(avail)
    return {"url": _safe_url(pick["url"]), "alt": pick["alt"], "source": source}


async def pick_or_generate(query: str, exclude: list[str] | None = None, seed: int = 0) -> dict:
    """Pesquisa → catálogo (se o tema bater) → senão GERA a imagem pedida.

    É o comportamento do site de referência: o cliente pede «foto do salão com
    mesas postas» e a página recebe exatamente isso — real se houver, gerado se
    não houver. Nunca foto aleatória sem noção.
    """
    exclude = exclude or []
    picked = await _pick_fresh(slug_words(query) or query, exclude)
    if picked:
        return picked
    hit = _curated_match(query, exclude, seed)
    if hit:
        return hit
    gen = await generate_image(query)
    if gen and gen["url"] not in exclude:
        return gen
    return _curated(query, exclude, seed)


async def pick_photo(query: str, exclude: list[str] | None = None, seed: int = 0) -> dict:
    """Pexels (se houver chave) → Openverse (sem chave) → catálogo curado.

    Sempre que possível devolve uma foto NÃO usada na página — «trocar a
    imagem» tem de trocar mesmo, não devolver a mesma.
    """
    exclude = exclude or []
    picked = await _pick_fresh(slug_words(query) or query, exclude)
    if picked:
        return picked
    return _curated(query, exclude, seed)


async def pick_by_tags(tags: list[str], exclude: list[str] | None = None, seed: int = 0) -> dict:
    """Tags decididas pelo agente (já em inglês) — sem o dicionário no caminho."""
    exclude = exclude or []
    clean = [re.sub(r"[^a-z0-9\s-]", "", t.lower().strip()) for t in tags][:3]
    query = " ".join(t for t in clean if len(t) > 1)
    picked = await _pick_fresh(query, exclude)
    if picked:
        return picked
    return _curated(query, exclude, seed)


async def pick_for_role(query: str, role: str, exclude: list[str] | None = None, seed: int = 0) -> dict:
    hint = ROLE_HINTS.get(role, "")
    return await pick_photo(f"{query} {hint}".strip(), exclude, seed)
