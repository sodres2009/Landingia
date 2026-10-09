"""O agente em Python: plan (2 passes), rewrite, section, image, intents, pesquisa.

A qualidade vem dos prompts portados (prompts.py) + validação Pydantic
(ask_json). Não existe motor local de páginas — quando a IA falha, a rota
devolve 502 e o frontend mostra a proposta como falhada com retry (a fila
sequencial no /create já trata disso).
"""
import json
import re
import unicodedata
from typing import AsyncGenerator, Optional

import httpx
from pydantic import BaseModel, Field

from . import db, llm, prompts
from .models import (Briefing, ImageIn, IntentIn, IntentOut, InterviewOut, PlanOut,
                     RewriteIn, Section, SectionIn, ThemeIn)
from .services import images, site, studio

# ─────────────────────────── pesquisa (DuckDuckGo) ───────────────────────────

UA = {"User-Agent": "Mozilla/5.0 (landing-ai/1.0; research assist)"}


async def research_subject(query: str) -> Optional[dict]:
    """Um facto real da web quando o negócio é fora do comum (port de lib/ai/research.ts)."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0), headers=UA) as client:
            res = await client.get("https://html.duckduckgo.com/html/", params={"q": query[:120]})
            if res.status_code != 200:
                return None
            title = re.search(r'result__a[^>]*>(.*?)</a>', res.text, re.DOTALL)
            snippet = re.search(r'result__snippet[^>]*>(.*?)</a>', res.text, re.DOTALL)
            if not title or not snippet:
                return None
            clean = lambda s: re.sub(r"<[^>]+>", "", s).replace("&amp;", "&").strip()
            t, sn = clean(title.group(1)), clean(snippet.group(1))
            if len(sn) < 60:
                return None
            return {"title": t[:160], "extract": sn[:400], "source": "duckduckgo"}
    except Exception:
        return None


# ─────────────────────────── entrevista (antes do plano) ───────────────────────────


async def interview(briefing: Briefing) -> InterviewOut:
    """O agente lê o briefing e pergunta o que não pode inventar.

    Briefing vago → perguntas; briefing rico → zero perguntas (não enchemos
    linguagem ao cliente). Falha de IA nunca bloqueia a criação: devolve tudo
    vazio e o /create avança direto para o plano.
    """
    user = prompts.INTERVIEW_USER
    for key, val in {
        "{description}": briefing.description, "{objective}": prompts.objective_focus(briefing.objective),
        "{style}": prompts.style_direction(briefing.style),
        "{answers}": json.dumps(briefing.answers or {}, ensure_ascii=False),
    }.items():
        user = user.replace(key, val)
    try:
        out = await llm.ask_json(prompts.INTERVIEW_SYSTEM, user, InterviewOut, retries=1, session="interview")
    except Exception:
        return InterviewOut()
    out.questions = [q for q in out.questions if q.question.strip()][:5]
    out.questions = _drop_known_facts(out.questions, briefing)
    given = f"{briefing.description} {json.dumps(briefing.answers or {}, ensure_ascii=False)}"
    if not out.questions and len(briefing.description) < 80 and not _PRICE_RE.search(given):
        out.questions = [{
            "key": "detalhe", "question": "Qual é a oferta e o preço principal que queres destacar?",
            "why": "Dá números reais à página em vez de genéricos.", "needs": "text",
        }]
    return out


_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]{2,}")
_PHONE_RE = re.compile(r"(?:\+\d{2,3}[\s.-]?)?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}")
_PRICE_RE = re.compile(r"\d+\s*€|€\s*\d+|preço de \d", re.IGNORECASE)
# O que cada pergunta procura → regex do briefing que a torna redundante.
_ASK_PATTERNS: list[tuple[re.Pattern, re.Pattern]] = [
    (re.compile(r"\bemail\b|\be-?mail\b", re.I), _EMAIL_RE),
    (re.compile(r"telefone|telem|whatsapp|n..?mero de (contacto|telefone)", re.I), _PHONE_RE),
    (re.compile(r"\bpre[çc]o|quanto custa|\bvalor\b|\bcusta\b", re.I), _PRICE_RE),
    (re.compile(r"\bnif\b|contribuinte|iban", re.I), re.compile(r"\bnif\b|contribuinte|iban", re.I)),
]


def _drop_known_facts(questions: list, briefing: Briefing) -> list:
    """O free tier pergunta o que o cliente já deu: se o facto está no briefing/
    respostas (email, telefone, preço), a pergunta correspondente é cortada."""
    given = f"{briefing.description} {json.dumps(briefing.answers or {}, ensure_ascii=False)}"
    kept = []
    for q in questions:
        ask = q.question if hasattr(q, "question") else q.get("question", "")
        if any(ask_re.search(ask) and given_re.search(given) for ask_re, given_re in _ASK_PATTERNS):
            continue
        kept.append(q)
    return kept


# ─────────────────────────── plan (2 passes) ───────────────────────────


class _RawPlan(BaseModel):
    """Saída do LLM — tudo opcional; defaults seguros no pós-validação."""
    name: str = "Landing Page criada com IA"
    objective: str = ""
    audience: str = ""
    offer: str = ""
    cta: str = "COMEÇAR AGORA"
    brandColors: list[str] = Field(default_factory=list)
    visualDirection: str = ""
    visualQueries: list[str] = Field(default_factory=list)
    brandSummary: Optional[str] = None
    productSummary: Optional[str] = None
    theme: Optional[dict] = None
    questions: list[dict] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)


class _Strategy(BaseModel):
    persona: str = ""
    angle: str = ""
    promise: str = ""
    objections: list[str] = Field(default_factory=list)
    proof: str = ""


class _ImageTags(BaseModel):
    tags: list[str] = Field(default_factory=list)
    alt: str = ""


_STRATEGY_CACHE: dict[str, _Strategy] = {}
HINTS = [
    "Abordagem montra: abre com o produto/oferta em destaque e prova visual.",
    "Abordagem autoridade: abre com a dor do cliente, mostra método e depois prova.",
    "Abordagem direta: página curta e assertiva, foco total em conversão.",
    "Abordagem história: conta a origem do negócio e termina em oferta.",
]

DEFAULT_LAYOUTS = {
    "hero": "hero-split", "benefits": "benefits-grid", "problem": "benefits-zigzag",
    "features": "benefits-grid", "social": "testimonials-cards", "proof": "proof-stats",
    "cta": "cta-band", "contact": "form-split", "form": "form-split",
}


def _pick_layout(sec_type: str, offered: Optional[str]) -> Optional[str]:
    if offered and offered not in ("stack",):
        return offered
    return DEFAULT_LAYOUTS.get(sec_type)


async def strategy_pass(briefing: Briefing, research: Optional[dict], extra: str = "") -> Optional[_Strategy]:
    key = f"{briefing.description}|{briefing.objective}|{briefing.variantHint or ''}".lower()
    cached = _STRATEGY_CACHE.get(key)
    if cached:
        return cached
    research_block = f"\nFACTO REAL: {research['title']} — {research['extract']}" if research else ""
    research_block += extra
    hint = f"\nÂNGULO PEDIDO: {briefing.variantHint}" if briefing.variantHint else ""
    user = (f"{prompts.STRATEGY_USER}\nBRIEFING: {briefing.description}\n"
            f"OBJETIVO: {briefing.objective}{research_block}{hint}")
    try:
        raw = await llm.chat(prompts.STRATEGY_SYSTEM, user, temperature=0.7, session="strategy")

        def line(prefix: str) -> str:
            for l in raw.splitlines():
                l = l.strip()
                if l.upper().startswith(prefix):
                    return l.split(":", 1)[1].strip() if ":" in l else ""
            return ""

        s = _Strategy(
            persona=line("PERSONA"),
            angle=line("ÂNGULO") or line("ANGULO"),
            promise=line("PROMESSA"),
            objections=[x for x in (line("OBJEÇÃO-1") or line("OBJECAO-1"), line("OBJEÇÃO-2") or line("OBJECAO-2")) if x],
            proof=line("PROVA"),
        )
        if not s.persona or not s.promise:
            return None
        _STRATEGY_CACHE[key] = s
        return s
    except Exception:
        return None


def _strategy_block(s: Optional[_Strategy]) -> str:
    if not s:
        return ""
    return (f"\nESTRATÉGIA DECIDIDA (segue-a, não a reinventes):\n- Cliente: {s.persona}\n"
            f"- Ângulo: {s.angle}\n- Promessa: {s.promise}\n"
            f"- Objeções a desarmar: {' · '.join(s.objections)}\n- Prova: {s.proof}")


_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_THEME_FONTS = {"modern", "editorial", "humanist", "mono"}
_THEME_GRADS = {"aurora", "sunset", "mint", "mono", "spotlight", "mesh"}


def _clean_theme(t: Optional[dict]) -> Optional[dict]:
    """Tema do LLM → PageTheme seguro; inválido completo = None (aspeto default)."""
    if not isinstance(t, dict):
        return None
    hex_or = lambda v, d: str(v) if isinstance(v, str) and _HEX.match(str(v)) else d
    mode = str(t.get("mode") or "").lower()
    if mode not in ("light", "dark"):
        return None
    accent = hex_or(t.get("accent"), "")
    if not accent:
        return None
    out = {
        "mode": mode,
        "bg": hex_or(t.get("bg"), "#0e1220" if mode == "dark" else "#ffffff"),
        "ink": hex_or(t.get("ink"), "#eef2fb" if mode == "dark" else "#141a28"),
        "accent": accent,
        "accent2": hex_or(t.get("accent2"), accent),
        "radius": min(max(int(t.get("radius") or 18), 6), 28),
        "font": str(t.get("font") or "") if str(t.get("font") or "") in _THEME_FONTS else "modern",
        "gradient": str(t.get("gradient") or "") if str(t.get("gradient") or "") in _THEME_GRADS else "aurora",
    }
    return out


def _theme_from_colors(colors: list[str]) -> Optional[dict]:
    """Modelo esqueceu-se do theme: deriva um seguro das brandColors (nunca ficar sem)."""
    accent = next((str(c) for c in colors if isinstance(c, str) and _HEX.match(str(c))), None)
    if not accent:
        return None
    return {"mode": "light", "bg": "#ffffff", "ink": "#141a28", "accent": accent,
            "accent2": accent, "radius": 18, "font": "modern", "gradient": "aurora"}


def _site_block(info: Optional[dict]) -> str:
    """Homepage do cliente lida agora: factos + cores reais para o plano herdar."""
    if not info:
        return ""
    cores = ", ".join(info["colors"]) if info["colors"] else "sem cores óbvias no CSS"
    fotos = ", ".join(info.get("images", [])[:6])
    pags = info.get("pages") or []
    pag_txt = "".join(f"\n  • {p['title'] or p['url']}: {p['text'][:220]}" for p in pags[:3])
    return (
        f"\nSITE DO CLIENTE (lido agora em {info['url']}): {info['title']} — {info["description"]}"[:400] +
        (f"\nPÁGINAS INTERNAS LIDAS (usa estes factos reais — catálogo, serviços, moradas):\n{pag_txt}" if pag_txt else "") +
        f"\nCORES REAIS DO SITE: {cores} — o accent do tema vem da cor de marca, não de gosto."
        f"\nTEXTO REAL DO SITE (usa factos daqui, não inventes): {info['text'][:600]}" +
        (f"\nFOTOS REAIS DO SITE (já serão usadas na página — não inventes URLs de fotos): {fotos}" if fotos else "")
    )


def _normalize_plan(raw: _RawPlan) -> PlanOut:
    """Contrato do Builder: ids, layouts válidos, aliases de content (anti-lixo do LLM)."""
    sections = []
    for sec in raw.sections:
        sec = sec.normalized()
        sec.style.layout = _pick_layout(sec.type, sec.style.layout)
        for el in sec.elements:
            content = el["content"]
            if el["type"] == "text" and not isinstance(content.get("text"), str) and isinstance(content.get("content"), str):
                content["text"] = content["content"]
            # aspas_envolventes: títulos que chegam «entre aspas» do LLM saem limpos
            for k in ("text", "label", "title"):
                v = content.get(k)
                if isinstance(v, str):
                    content[k] = v.strip().strip('«»“”„"\'').strip()
        if sec.type or sec.elements:
            sections.append(sec)
    if not sections:
        raise ValueError("O plano devolvido não tem secções.")
    questions = []
    for i, q in enumerate(raw.questions[:5]):
        if isinstance(q, str):
            questions.append({"key": f"q{i}", "question": q, "why": "Ajuda a tornar a página mais específica.", "placeholder": "Escreva a resposta"})
        elif isinstance(q, dict) and q.get("question"):
            questions.append({"key": str(q.get("key") or f"q{i}"), "question": str(q["question"]), "why": str(q.get("why") or ""), "placeholder": str(q.get("placeholder") or "Escreva a resposta")})
    # Rede de segurança (o free tier ignora o prompt): o formulário da página já
    # recolhe nome/email/contacto do visitante — essas perguntas nunca vão para o checklist.
    visitor_data = ("nome", "email", "e-mail", "whatsapp", "telefone", "telemov", "contacto")
    questions = [q for q in questions if not any(w in q["question"].lower() for w in visitor_data)][:2]
    return PlanOut(
        source="provider", name=raw.name, objective=raw.objective or "",
        audience=raw.audience or "", offer=raw.offer or "", cta=raw.cta or "COMEÇAR AGORA",
        brandColors=[str(c) for c in raw.brandColors[:6]],
        visualDirection=raw.visualDirection or "", visualQueries=[str(q) for q in raw.visualQueries[:4]],
        brandSummary=raw.brandSummary, productSummary=raw.productSummary,
        theme=_clean_theme(raw.theme) or _theme_from_colors(raw.brandColors),
        questions=questions, sections=sections,
    )


async def apply_images(plan: PlanOut, client_photos: Optional[list[str]] = None) -> PlanOut:
    """Fotos nos slots que o agente pediu — fotos do cliente PRIMEIRO, pesquisa depois.

    O agente decide se a página precisa de fotos — não injetamos imagens
    à força em secções sem elas; landing moderna vive de tipografia e prova.
    Fotos enviadas pelo cliente têm prioridade absoluta sobre stock.
    """
    pool = " ".join(x for x in [plan.productSummary or "", plan.brandSummary or "", *plan.visualQueries] if x)
    client = [str(u) for u in (client_photos or []) if str(u).startswith(("http", "/"))]
    used: list[str] = []
    seed = 0
    ci = 0

    async def fill(content: dict, title: str, role: str) -> str:
        nonlocal seed, ci
        if ci < len(client):  # foto real do cliente antes de qualquer stock
            url = client[ci]
            ci += 1
            used.append(url)
            seed += 1
            return url
        query = f"{content.get('alt') or ''} {title} {pool}".strip()
        photo = await images.pick_for_role(query or pool, role, used, seed)
        seed += 1
        used.append(photo["url"])
        if photo["alt"] and not str(content.get("alt") or "").strip():
            content["alt"] = photo["alt"]
        return photo["url"]

    for s in plan.sections:
        for el in s.elements:
            c = el["content"]
            if el["type"] == "image" and not str(c.get("url") or "").strip():
                c["url"] = await fill(c, s.title, s.type)
            if el["type"] == "gallery" and isinstance(c.get("images"), list):
                for g in c["images"]:
                    if isinstance(g, dict) and not str(g.get("url") or "").strip():
                        g["url"] = await fill(g, s.title, s.type)
    return plan


def _scrub_fiscal(plan: PlanOut, briefing: Briefing) -> PlanOut:
    """NIF/IBAN inventados não entram na página: só passam se o cliente os escreveu."""
    given = f"{briefing.description} {json.dumps(briefing.answers or {}, ensure_ascii=False)}".lower()
    if any(k in given for k in ("nif", "iban", "contribuinte")):
        return plan
    pat = re.compile(r"\b(nif|nº?\s*contribuinte|iban)\b[\s:]*[\d][\d\s.\-]{0,18}", re.IGNORECASE)

    def clean(s: str) -> str:
        return pat.sub("", s).strip()

    for sec in plan.sections:
        for el in sec.elements:
            c = el["content"]
            for key in ("text", "note", "a", "title", "success"):
                if isinstance(c.get(key), str) and pat.search(c[key]):
                    c[key] = clean(c[key])
            if isinstance(c.get("items"), list):  # footer cols → {label,url}
                for col in c["items"]:
                    if isinstance(col, dict) and isinstance(col.get("items"), list):
                        col["items"] = [x for x in col["items"]
                                         if not pat.search(str(x.get("label", "")))]
    return plan


def _scrub_phones(plan: PlanOut, briefing: Briefing) -> PlanOut:
    """Telefones inventados não entram: um número só passa se o cliente o escreveu."""
    given = f"{briefing.description} {json.dumps(briefing.answers or {}, ensure_ascii=False)}"
    pat = re.compile(r"(?:\+?\s?351[\s.\-]?)?(?:[29]\d{2})(?:[\s.\-]?\d{3}){2}")
    given_digits = set(re.findall(r"\d{6,}", re.sub(r"\D", "", given)))
    if not given_digits:
        # o cliente não deu NENHUM número → qualquer telefone na página é inventado
        def wipe(s: str) -> str:
            return pat.sub("", s).strip()
    else:
        def wipe(s: str) -> str:
            def keep(m: re.Match) -> str:
                digits = re.sub(r"\D", "", m.group(0))
                core = digits[-9:] if len(digits) >= 9 else digits
                return m.group(0) if any(core in g or g in digits for g in given_digits) else ""
            return pat.sub(keep, s).strip()

    def walk(value, key: str = ""):
        if key == "url":  # URLs de fotos têm números — não são telefones
            return value
        if isinstance(value, str):
            return wipe(value) if pat.search(value) else value
        if isinstance(value, list):
            return [walk(v) for v in value]
        if isinstance(value, dict):
            return {k: walk(v, k) for k, v in value.items()}
        return value

    for sec in plan.sections:
        for el in sec.elements:
            el["content"] = walk(el["content"])
    return plan


def _ensure_contact_kit(plan: PlanOut, briefing: Briefing) -> PlanOut:
    """Float WhatsApp e mapa: se o briefing deu telefone/morada, existem — sem depender do modelo."""
    text = f"{briefing.description} {briefing.answers or {}}"
    has = lambda kind: any(el.get("type") == kind for sec in plan.sections for el in sec.elements)
    candidates = re.findall(r"(?:\+?351[\s.-]?)?9[0-46-9](?:[\s.-]?\d){7}", text)
    phone = next((
        re.sub(r"\D", "", c)[-9:] for c in candidates
        if (lambda d: len(d) in (9, 12) and d[-9:].startswith("9"))(re.sub(r"\D", "", c))
    ), None)
    if phone and not has("float"):
        cta = (plan.cta or "Falar no WhatsApp").strip()
        plan.sections[-1].elements.append({"id": "", "type": "float",
            "content": {"phone": phone, "message": cta[:80] or "Olá! Quero saber mais."}})
    morada = re.search(r"(?i)(rua|avenida|av\.|estrada|praceta|praça|quinta|lugar|parque de estacionamento)[^.\n]{6,90}", briefing.description)
    if morada and not has("map"):
        # query só com a rua perde-se no Google: cidade/postal + Portugal é que dá o pino certo
        query = morada.group(0).strip()[:90]
        zona = re.search(r"\b\d{4}[- ]?\d{3}\b", briefing.description) or re.search(
            r"(?i)(?:em|na|no)\s+([áãça-zÁÂÍÓÚÜâêîõü]{2,}[áãça-zÁÂÍÓÚÜâêîõü -]{0,30})", briefing.description)
        cidade = (zona.group(0).strip() if zona else "").strip(" ,.")[:40]
        cidade_ult = cidade.split()[-1].lower() if cidade else ""
        sem_ac = lambda s: "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))
        if cidade_ult and sem_ac(cidade_ult) not in sem_ac(query):
            query = query + ", " + cidade
        if "portugal" not in query.lower():
            query += ", Portugal"
        plan.sections[-1].elements.append({"id": "", "type": "map",
            "content": {"query": query[:150]}})
    return plan

async def _plan_once(briefing: Briefing) -> PlanOut:
    research = await research_subject(f"{briefing.description}")
    site_url = site.normalize_url(briefing.description)
    site_info = await site.fetch_site(site_url) if site_url else None
    strategy = await strategy_pass(briefing, research, extra=_site_block(site_info))
    research_block = (f"\nPESQUISA REAL NA INTERNET (facto confirmado, usa-o):\n"
                      f"{research['title']} — {research['extract']}\nFONTE: {research['source']}" if research else "")
    research_block += _site_block(site_info)
    uid = (llm.current_user.get() or {}).get("id")
    prior = db.get_user_style(uid) if uid else None
    if prior:
        research_block += ("\nMEMÓRIA DE ESTILO DESTE UTILIZADOR: " + json.dumps(prior, ensure_ascii=False)
                           + " — foi este o visual que o cliente usou antes: por defeito CONTINUA essa "
                           + "identidade (mesma família de cores/fonte/gradiente, evoluída), salvo pedido "
                           + "contrário no briefing.")
    hint = f"\nÂNGULO DESTA PROPOSTA: {briefing.variantHint}" if briefing.variantHint else ""
    user = prompts.PLAN_USER
    for key, val in {
        "{date}": prompts.date_rule(), "{description}": briefing.description, "{objective}": prompts.objective_focus(briefing.objective),
        "{style}": prompts.style_direction(briefing.style), "{context}": json.dumps(briefing.context.model_dump() if briefing.context else {}, ensure_ascii=False),
        "{answers}": json.dumps(briefing.answers or {}, ensure_ascii=False),
        "{size_rules}": prompts.SIZE_RULES_RICH if briefing.depth == "rich" else prompts.SIZE_RULES,
        "{research}": research_block, "{strategy}": _strategy_block(strategy), "{hint}": hint,
    }.items():
        user = user.replace(key, val)
    raw = await llm.ask_json(prompts.SYSTEM_PROMPT, user, _RawPlan,
                             max_tokens=6000 if briefing.depth == "rich" else None, session="plan")
    plan = _ensure_contact_kit(_scrub_phones(_scrub_fiscal(_normalize_plan(raw), briefing), briefing), briefing)
    if site_info and site_info["colors"]:
        plan.brandColors = site_info["colors"][:6]
        if plan.theme:
            plan.theme["accent"] = site_info["colors"][0]
    client_photos = list(briefing.context.contentSources) if briefing.context else []
    return await apply_images(plan, client_photos)


async def generate_plans(briefing: Briefing, variants: int = 1) -> list[dict]:
    """Propostas em fila sequencial (o free tier bloqueia chamadas simultâneas)."""
    plans: list[dict] = []
    for i in range(variants):
        b = briefing.model_copy(update={"variantHint": briefing.variantHint or HINTS[i % len(HINTS)] if variants > 1 else briefing.variantHint})
        try:
            plan = await _plan_once(b)
            plans.append({"ok": True, "plan": plan.model_dump()})
        except Exception as exc:
            plans.append({"ok": False, "error": str(exc)})
    return plans


async def generate_plans_stream(briefing: Briefing, variants: int) -> AsyncGenerator[str, None]:
    """SSE: progresso real por proposta — o /create mostra a miniatura assim que sai.

    Heartbeat `: ping` a cada 12s: o edge da plataforma corta ligações caladas
    há ~100s e o modelo pode demorar mais que isso (visto com o FactorRouter).
    """
    import asyncio
    for i in range(variants):
        hint = briefing.variantHint or (HINTS[i % len(HINTS)] if variants > 1 else None)
        b = briefing.model_copy(update={"variantHint": hint})
        yield f"data: {json.dumps({'event': 'progress', 'index': i, 'stage': 'generating'})}\n\n"
        task = asyncio.create_task(_plan_once(b))
        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=12)
            except asyncio.TimeoutError:
                yield ": ping\n\n"  # comentário SSE — os clientes ignoram, a ligação vive
            except Exception:
                break
        try:
            plan = task.result()
            payload = {"event": "plan", "index": i, "ok": True, "plan": plan.model_dump()}
        except Exception as exc:
            payload = {"event": "plan", "index": i, "ok": False, "error": str(exc)}
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        if i + 1 < variants:
            await asyncio.sleep(1.2)
    yield f"data: {json.dumps({'event': 'done'})}\n\n"


# ─────────────────────────── rewrite / section / image ───────────────────────────


async def rewrite(req: RewriteIn) -> str:
    ctx = req.context.model_dump(exclude_none=True) if req.context else {}
    has_ctx = any(v for v in ctx.values())
    user = (f"{prompts.date_rule()}\nInstrução: {req.instruction}\nTexto atual: {req.current}"
            + (f"\nContexto da marca: {json.dumps(ctx, ensure_ascii=False)}" if has_ctx else "")
            + "\nReescreve APENAS esse texto, mantendo o facto central. Nunca copies símbolos do pedido (como {})."
            " Devolve APENAS o novo texto, sem aspas nem explicações.")
    return (await llm.chat(prompts.REWRITE_SYSTEM, user, session="rewrite")).strip()


async def create_section(req: SectionIn) -> Section:
    """Mesma cabeça do agente de plan: mesmas regras de elementos/layout/tema."""
    user = (f"Cria UMA nova secção para uma Landing Page.\n{prompts.date_rule()}\n"
            f"PEDIDO: {req.description}\nOBJETIVO: {prompts.objective_focus(req.objective or 'Captar leads')}\n"
            f"CONTEXTO: {json.dumps(req.context.model_dump() if req.context else {}, ensure_ascii=False)}\n"
            "Copy específica deste produto — zero clichés («qualidade», «melhor solução»). "
            "A secção tem de se integrar no resto da página: não repitas informação de outras secções.\n"
            "Devolve JSON: {type,title,style,elements:[{type,content}]}.\n"
            f"{prompts.DESIGN_RULES}\n{prompts.IMAGE_RULES}\n{prompts.LAYOUT_SPEC}\n{prompts.ELEMENT_SPEC}")
    sec = await llm.ask_json(prompts.SYSTEM_PROMPT, user, Section, session="section")
    sec = sec.normalized()
    sec.style.layout = _pick_layout(sec.type, sec.style.layout)
    for el in sec.elements:
        if el["type"] == "image" and not str(el["content"].get("url") or "").strip():
            photo = await images.pick_for_role(f"{sec.title} {req.description}", sec.type, [], 0)
            el["content"]["url"] = photo["url"]
            if photo["alt"]:
                el["content"]["alt"] = photo["alt"]
    if not sec.elements:
        raise ValueError("A secção devolvida não tem elementos válidos.")
    return sec


async def choose_image(req: ImageIn) -> dict:
    business = json.dumps({
        "objective": req.objective or "",
        "product": req.context.productSummary if req.context else "",
        "visual": req.context.visualDirection if req.context else "",
        "queries": req.context.visualQueries if req.context else [],
    }, ensure_ascii=False)
    try:
        user = prompts.IMAGE_TAGS_USER.format(
            instruction=req.instruction,
            previous=(req.previous or "nenhuma descrição")[:200],
            business=business,
        )
        spec = await llm.ask_json(prompts.IMAGE_TAGS_SYSTEM, user, _ImageTags, retries=0, session="image")
        tags = [t for t in spec.tags if re.fullmatch(r"[a-z0-9\s-]{2,40}", t.lower().strip())][:3]
        if tags:
            # pedido original PT + tags EN juntos: pesquisa acerta, catálogo PT bate, senão gera
            photo = await images.pick_or_generate(f"{req.instruction} {' '.join(tags)}", req.exclude, 0)
            alt = spec.alt.strip() or req.instruction
            return {"url": photo["url"], "alt": alt, "source": photo["source"]}
    except Exception:
        pass
    # Sem interpretação do modelo: pesquisa → catálogo → geração (nunca foto sem noção).
    # Ajuste vago («fica melhor») não pesquisa por essa frase — pesquisa o assunto da imagem atual.
    query = f"{req.instruction} {req.previous or ''}".strip() if len(req.instruction) < 25 else req.instruction
    return await images.pick_or_generate(query, req.exclude, 0)


async def page_theme(req: ThemeIn) -> dict:
    """«melhora o fundo» → tema novo para a página toda (cor/modo/gradiente), conteúdo intacto."""
    user = (
        f"PEDIDO DO CLIENTE: {req.instruction}\n"
        f"NEGÓCIO DA PÁGINA: {(req.context or 'desconhecido')[:300]}\n"
        f"TEMA ATUAL: {json.dumps(req.current or {}, ensure_ascii=False)}\n"
        "Devolve APENAS o objeto theme (mode/bg/ink/accent/accent2/radius/font/gradient), "
        "respeitando THEME_RULES. O pedido do cliente manda: «mais escuro» = dark; «mais claro» "
        "= light; sem indicação, decide como diretor de arte e MUDA visivelmente em relação ao "
        "TEMA ATUAL — um fundo novo que se pareça com o antigo é falhar o pedido."
    )
    raw = await llm.ask_json(prompts.SYSTEM_PROMPT, user, dict, retries=0, session="theme")
    theme = _clean_theme(raw.get("theme") if isinstance(raw.get("theme"), dict) else raw)
    if not theme:
        raise ValueError("O agente não conseguiu desenhar um fundo válido — tenta outra descrição.")
    return theme


async def interpret_intent(req: IntentIn) -> IntentOut:
    """PT natural → ação estruturada que o Builder executa no canvas."""
    sections = [{
        "i": i,
        "type": s.get("type"),
        "title": str(s.get("title") or "")[:60],
        "resumo": str(s.get("excerpt") or "")[:300],
    } for i, s in enumerate(req.sections)][:14]
    user = prompts.INTENT_USER
    history = "; ".join(
        f"{'cliente' if m.get('role') == 'user' else 'agente'}: {str(m.get('text', ''))[:120]}"
        for m in req.history[-6:] if str(m.get("text", "")).strip()
    ) or "sem histórico"
    for key, val in {
        "{instruction}": req.instruction,
        "{context}": (req.context or "desconhecido")[:700],
        "{history}": history,
        "{selection}": req.selection or "nada selecionado",
        "{sections}": json.dumps(sections, ensure_ascii=False),
    }.items():
        user = user.replace(key, val)
    intent = await llm.ask_json(prompts.INTENT_SYSTEM, user, IntentOut, retries=0, session="intent")
    valid_types = {"hero", "benefits", "problem", "features", "social", "proof", "cta",
                   "form", "faq", "pricing", "schedule", "scheduling", "gallery", "video", "contact"}
    if intent.section_type and intent.section_type not in valid_types:
        intent.section_type = None
    # ações extra do mesmo pedido («muda o título E mete telefone»): mesma sanitização
    intent.actions = intent.actions[:3]
    for act in intent.actions:
        if act.section_type and act.section_type not in valid_types:
            act.section_type = None
    if intent.kind == "ask":
        intent.actions = []  # se há pergunta, nada se executa ainda
    if intent.kind == "ask" and not intent.reply.strip():
        # Ask sem pergunta = o agente wants perguntar mas não soube o quê.
        # Transformar em rewrite cego era o bug do «faz tudo sem perguntar» (26-09).
        intent.reply = "Não percebi bem o que queres mudar e onde — diz-me o assunto e a secção (ex.: «o título do hero», «a foto do contacto») que eu trato disso."
    return intent


# ─────────────────────────── Studio (segundo gerador) ──────────────────────────


async def _design_once(briefing: Briefing, seed_index: int = 0, owner_id: Optional[str] = None) -> dict:
    """Uma página studio: HTML livre dirigido pelo briefing, validado pelo servidor.

    O modelo compõe; nós validamos. Erros de kit → UM re-pedido com feedback
    (como o ask_json faz para JSON). Persiste histórico anti-repetição do dono.
    """
    research = await research_subject(briefing.description)
    site_url = site.normalize_url(briefing.description)
    site_info = await site.crawl_site(site_url) if site_url else None
    strategy = await strategy_pass(briefing, research, extra=_site_block(site_info))
    memory = ""
    prior = db.get_user_style(owner_id) if owner_id else None
    if prior:
        memory = ("MEMÓRIA DE ESTILO DESTE UTILIZADOR: " + json.dumps(prior, ensure_ascii=False) +
                  " — foi este o visual que o cliente usou antes: por defeito CONTINUA essa "
                  "identidade (mesma família de cores/fonte, evoluída), salvo pedido contrário.")
    seed = briefing.variantHint or studio.art_seed(seed_index)
    user = studio.design_user(
        briefing=briefing.description + (
            " | RESPOSTAS DO CLIENTE: " + json.dumps(briefing.answers, ensure_ascii=False) if briefing.answers else ""),
        objective=prompts.objective_focus(briefing.objective),
        style=prompts.style_direction(briefing.style),
        strategy=_strategy_block(strategy),
        site=_site_block(site_info),
        memory=memory,
        history=studio.anti_repeat_block(db.recent_studio_digests(owner_id) if owner_id else []),
        seed=seed,
        date_rule=prompts.date_rule(),
    )
    system = studio.design_system()
    raw = await llm.chat(system, user, temperature=0.9, max_tokens=14000, session="design", timeout=240.0, stream=True)

    def _clean(html_raw: str) -> str:
        html = studio.sanitize_html(studio.extract_html(html_raw))
        return studio.map_query_fix(html, briefing.description)

    html = _clean(raw)
    errs = studio.validate_kit(html, briefing.description)
    if errs:
        raw2 = await llm.chat(system, user + "\n\nA TUA PÁGINA TEM ESTES ERROS (corrige, devolve APENAS o HTML completo corrigido):\n- " + "\n- ".join(errs),
                              temperature=0.5, max_tokens=14000, session="design")
        try:
            html2 = _clean(raw2)
            errs2 = studio.validate_kit(html2, briefing.description)
            if len(errs2) < len(errs):
                html, errs = html2, errs2
        except Exception:
            pass
    if errs:
        raise ValueError("a página não passou na validação: " + "; ".join(errs))
    phone = studio.find_phone(briefing.description)
    client_photos = list(briefing.context.contentSources) if briefing.context else []
    # fotos do site do cliente entram a seguir aos uploads: o swap tenta-as e,
    # se alguma vier morta (hotlink), aquela célula acaba com Pexels real.
    client_photos += list(site_info.get("images") or []) if site_info else []
    html = await design_photos_and_fill(html, briefing.description, client_photos)
    return {"html": studio.inject_runtime(html, phone), "digest": studio.digest(html), "phone": phone}


async def design_photos_swap(html: str, briefing_text: str, client_photos: list[str] | None = None) -> tuple[str, list[str]]:
    """Substitui as fotos do Studio por fotos REAIS — mesmo motor do Rápido.

    O modelo usa picsum (nunca parte) mas é genérica; aqui cada <img> é trocada
    por uma foto pesquisada pelo seu alt/texto vizinho. Fotos do cliente primeiro.
    Falha de rede não bloqueia: a página fica com o picsum original.
    Devolve (html, fotos_do_cliente_por_usar) — o fill transforma as sobras em galeria.
    """
    import asyncio
    import re as _re
    import httpx as _httpx

    client = [u for u in (client_photos or []) if str(u).startswith(("http", "/"))]
    imgs = list(_re.finditer(r"<img\b[^>]*>", html))
    if not imgs:
        return html, client

    # hotlinks do site do cliente podem estar mortos/quentes (403 anti-leech):
    # validar numa ronda rápida; as mortas saem e aquela célula vai para Pexels.
    external = [u for u in client if str(u).startswith("http") and "images.pexels.com" not in u and "/uploads/" not in u]
    if external:
        async def _alive(u: str) -> bool:
            try:
                async with _httpx.AsyncClient(timeout=_httpx.Timeout(5.0, connect=3.0), follow_redirects=True) as c:
                    r = await c.get(u, headers={"User-Agent": "Mozilla/5.0"})
                    return r.status_code == 200 and r.headers.get("content-type", "").startswith("image")
            except Exception:
                return False
        results = await asyncio.gather(*(_alive(u) for u in external))
        dead = {u for u, ok in zip(external, results) if not ok}
        client = [u for u in client if u not in dead]

    used: list[str] = []
    ci = 0
    pieces: list[str] = []
    pos = 0
    for m in imgs:
        tag = m.group(0)
        src_m0 = _re.search(r"src=[\"']([^\"']*)[\"']", tag)
        src0 = src_m0.group(1) if src_m0 else ""
        # intocáveis: picsum/placeholder (vão ser trocados já já), pexels, uploads do
        # cliente, data:. TODO o resto (URL que o modelo inventou de outro site) é
        # foto partida — entra no mesmo funil e acaba com foto real.
        allowed = ("picsum.photos", "placeholder", "images.pexels.com", "/uploads/", "data:")
        placeholder = any(k in tag for k in ("picsum.photos", "placeholder"))
        hallucinated = bool(src0) and not any(k in src0 for k in allowed)
        if not placeholder and not hallucinated:
            continue
        alt_m = _re.search(r"alt=\"([^\"]*)\"", tag)
        query = (alt_m.group(1) if alt_m else "").strip() or briefing_text[:80]
        new_src = None
        try:
            if ci < len(client):
                new_src = client[ci]
                ci += 1
            else:
                photo = await images.pick_for_role(query, "gallery", used, len(used))
                new_src = photo["url"]
                if photo.get("alt") and alt_m and not alt_m.group(1).strip():
                    tag = tag.replace('alt=""', f'alt="{photo["alt"]}"', 1)
        except Exception:
            new_src = None
        if new_src is None and hallucinated:
            slug = _re.sub(r"[^a-z0-9]+", "-", (query or "foto").lower()).strip("-")[:40] or "foto"
            new_src = f"https://picsum.photos/seed/{slug}/1200/700"  # URL inventada fica melhor com picsum do que partida
        if new_src:
            used.append(new_src)
            tag = _re.sub(r"src=[\"\'][^\"\']*\"|src=[\"\'][^\"\']*\'",
                          'src="' + new_src + '"', tag, count=1)
        pieces.append(html[pos:m.start()])
        pieces.append(tag)
        pos = m.end()
    pieces.append(html[pos:])
    out = "".join(pieces)
    # CSS (hero/fundos): picsum fora de <img> também leva foto real pesquisada
    if "picsum.photos" in out:
        frags: list[str] = []
        pos2 = 0
        for m in _re.finditer(r"https?://picsum\.photos/[^\"')\s]+", out):
            try:
                photo = await images.pick_for_role(briefing_text[:80], "hero", used, len(used))
                used.append(photo["url"])
                frags.append(out[pos2:m.start()])
                frags.append(photo["url"])
                pos2 = m.end()
            except Exception:
                break
        out = "".join(frags) + out[pos2:] if frags else out
    return out, client[ci:]  # fotos do cliente que sobraram → o chamador decide


async def design_photos_and_fill(html: str, briefing_text: str,
                                 client_photos: list[str] | None) -> str:
    """Swap + garantia: se sobrarem fotos do site do cliente, o servidor desenha
    uma galeria e coloca-as lá. O utilizador deu fotos reais — nunca ficam de fora.
    """
    out, leftover = await design_photos_swap(html, briefing_text, client_photos)
    if leftover:
        out = studio.inject_gallery(out, leftover[:8])
    return out


async def generate_design_stream(briefing: Briefing, seed_index: int, owner_id: str) -> AsyncGenerator[str, None]:
    """SSE do Studio com heartbeat (o free tier pode passar os 100s calado)."""
    import asyncio
    yield f"data: {json.dumps({'event': 'progress', 'stage': 'composing'})}\n\n"
    task = asyncio.create_task(_design_once(briefing, seed_index, owner_id))
    while not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=12)
        except asyncio.TimeoutError:
            yield ": ping\n\n"
    try:
        out = task.result()
        yield f"data: {json.dumps({'event': 'design', 'ok': True, **out}, ensure_ascii=False)}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'event': 'design', 'ok': False, 'error': str(exc)[:300]})}\n\n"


async def generate_edit_stream(req) -> AsyncGenerator[str, None]:
    """SSE do design_edit com heartbeat — o free tier passa os 100s calado e o
    proxy da plataforma corta POSTs silenciosos (o browser via Failed to fetch)."""
    import asyncio
    yield f"data: {json.dumps({'event': 'progress', 'stage': 'editing'})}\n\n"
    task = asyncio.create_task(design_edit(req))
    while not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=12)
        except asyncio.TimeoutError:
            yield ": ping\n\n"
    try:
        out = task.result()
        yield f"data: {json.dumps({'event': 'edit', 'ok': True, **out}, ensure_ascii=False)}\n\n"
    except Exception as exc:
        yield f"data: {json.dumps({'event': 'edit', 'ok': False, 'error': str(exc)[:300]})}\n\n"


async def design_edit(req) -> dict:
    """O assistente edita a página studio por instrução — pelo mesmo funil de validação."""
    base = studio.strip_runtime(req.html)
    user = ("EDITA esta página HTML existente segundo a instrução. Muda APENAS o que a instrução pede "
            "e preserva o resto palavra a palavra — inclusive os data attrs (countdown/map/lead/wa).\n"
            f"INSTRUÇÃO: {req.instruction}\nNEGÓCIO E CONTACTOS: {req.briefing or '(sem nota)'}\n"
            "REGRAS DA RESPOSTA:\n"
            "- Se o briefing tem MORADA/local e a pagina NAO tem nenhum data-map: acrescenta <div data-map=\"morada, cidade, Portugal\"></div> na seccao de contacto/localizacao (o nosso runtime mostra o Google Maps la dentro). Mapas desenhados/pinos decorativos sao proibidos — substitui-os por data-map real.\n"
                        "- Se a instrução for ambígua ou impossível: NÃO edites — responde só com uma linha «ASK: <pergunta curta ao cliente em português>».\n"
            "- Se editares: a 1ª linha é «SUM: <máx 90 caracteres, frase em português a dizer o que mudaste>», depois o HTML completo.\n"
            "- Queixa de texto cortado/passar do sítio: REDUZ A LETRA A SÉRIO — o tamanho final tem de ficar visivelmente mais pequeno (o dobro de menor), não um clamp cosmético com o mesmo máximo. Baixa o font-size do elemento queixado E dos vizinhos; nenhuma palavra pode ultrapassar o contentor em 1280px nem em 390px. Se a instrução apontar um ALVO ESCOLHIDO, esse elemento É OBRIGATÓRIO mudar.\n\n"
            + studio.DESIGN_CONTRACT + "\nPÁGINA ATUAL:\n" + base[:150_000])
    system = studio.design_system()
    raw = await llm.chat(system, user, temperature=0.4, max_tokens=14000, session="design", timeout=240.0, stream=True)
    if "ASK:" in raw[:200]:
        q = raw.split("ASK:", 1)[1].strip().splitlines()[0][:300]
        return {"ask": q}
    _m = re.search(r"SUM:\s*([^\n]{2,120})", raw[:6000])
    summary = _m.group(1).strip()[:200] if _m else ""
    html = studio.map_query_fix(studio.sanitize_html(studio.extract_html(raw)), req.briefing)
    html, _leftover = await design_photos_swap(html, req.briefing)  # picsum do desenho vira foto real; edição não injeta galeria nova
    errs = studio.validate_kit(html, req.briefing)
    if errs:
        raise ValueError("a edição não passou na validação: " + "; ".join(errs))
    phone = studio.find_phone(req.briefing)
    return {"html": studio.inject_runtime(html, phone), "digest": studio.digest(html), "phone": phone, "summary": summary}
