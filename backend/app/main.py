"""FastAPI — backend do gerador de landing pages.

Rotas:
  GET  /healthz                  — liveness
  POST /agent/plan               — propostas (variants 1-4, fila sequencial)
  POST /agent/plan/stream        — SSE: cada proposta assim que fica pronta
  POST /agent/rewrite            — reescrita de texto com contexto de marca
  POST /agent/interview          — o agente pergunta antes de criar
  POST /agent/section            — secção nova a pedido
  POST /agent/image              — intenção → tags → foto real
  GET|POST /pages                — páginas (BD, não localStorage)
  GET|PUT|DELETE /pages/{id}
  POST /publish | /unpublish     — versão pública por slug
  GET  /published                — listagem (dashboard lê visitas/leads reais)
  GET  /published/{slug}         — página pública
  POST /visit                    — contador de visitas da URL pública
  POST /leads | GET /leads       — submissões de formulários
"""
from contextlib import asynccontextmanager
from typing import Optional
import time

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from . import agents, auth, config, db, llm
from .models import Briefing, ImageIn, IntentIn, LeadIn, Page, PublishIn, DesignEditIn, RewriteIn, SectionIn, ThemeIn
from .services import webhooks

SLUG_MAX = 400_000  # tamanho máximo do JSON de uma página publicada


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    auth.init_auth_tables()
    _seed_from_legacy()
    _ensure_admin()
    yield


app = FastAPI(title="Landing AI API", version="1.0.0", lifespan=lifespan)


# ── registo de pedidos com erro (diagnóstico; escrito em /tmp/err4xx.log) ───
@app.middleware("http")
async def _log_errors(request: Request, call_next):
    body = b""
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            body = await request.body()
        except Exception:
            body = b"<sem body>"
    try:
        response = await call_next(request)
    except Exception:
        _write_err(request, body, 500, b"exception")
        raise
    if response.status_code >= 400:
        _write_err(request, body, response.status_code, b"")
    return response


def _write_err(request: Request, body: bytes, status: int, note: bytes) -> None:
    """Regista método, path, body (cortado) e nota — para caçar erros difíceis."""
    import json as _json
    if request.url.path.startswith("/auth/"):
        body = b"<redigido>"  # nunca gravar palavras-passe em ficheiro
    try:
        rec = _json.dumps({
            "t": time.strftime("%H:%M:%S"), "m": request.method, "p": request.url.path,
            "s": status, "body": body[:400].decode("utf-8", "replace"), "note": note.decode("utf-8", "replace"),
        })
        with open("/tmp/err4xx.log", "a", encoding="utf-8") as f:
            f.write(rec + "\n")
    except Exception:
        pass


app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────── contas ───────────────────────────


def _ensure_admin() -> None:
    """A primeira conta a existir ganha role admin — o dono da instalação."""
    if auth.user_count() == 0:
        email, password = config.env("ADMIN_EMAIL"), config.env("ADMIN_PASSWORD")
        if email and password:
            try:
                auth.create_user(email, password, name="Admin", role="admin")
            except ValueError:
                pass


@app.middleware("http")
async def user_context(request: Request, call_next):
    """Utilizador do token → headers X-User-* do FactorRouter em cada chamada de IA."""
    token = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
    user = auth.read_token(token) if token else None
    llm.current_user.set({"id": user["sub"], "name": user.get("name", ""), "email": user.get("email", "")} if user else {})
    return await call_next(request)


def current_user(request: Request) -> Optional[dict]:
    """Token no header → payload ({sub,email,name}); None se não traz ou é inválido."""
    token = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
    return auth.read_token(token) if token else None


def require_user(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Entra na tua conta para continuar.")
    return user


_rl_hits: dict[str, list[float]] = {}


def _rate(request: Request, bucket: str, limit: int, window: int = 60) -> None:
    """Limita `limit` pedidos por `window` segundos por IP+bucket. 429 honesto."""
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "?")
    if ip == "testclient":  # TestClient do pytest — senão a suite esbarra no limite
        return
    now = time.time()
    hits = [x for x in _rl_hits.get(bucket + "|" + ip, []) if now - x < window]
    if len(hits) >= limit:
        raise HTTPException(429, "Demasiados pedidos — espera uns momentos e tenta outra vez.")
    hits.append(now)
    _rl_hits[bucket + "|" + ip] = hits
    if len(_rl_hits) > 5000:  # nunca cresce sem teto
        for k in [k for k, v in _rl_hits.items() if not v or now - v[-1] > window * 4][:2000]:
            _rl_hits.pop(k, None)


def _scope(request: Request) -> tuple[str, bool]:
    """(user_id, é admin) — admin também vê páginas órfãs criadas antes das contas."""
    u = require_user(request)
    fresh = auth.get_user(u["sub"])
    return u["sub"], bool(fresh and fresh["role"] == "admin")


def _check_page_owner(page_id: str, user_id: str, is_admin: bool) -> None:
    exists, owner = db.page_owner(page_id)
    if not exists:
        raise HTTPException(404, "Página não encontrada.")
    if not (owner == user_id or (is_admin and owner is None)):
        raise HTTPException(403, "Essa página pertence a outra conta.")


def _check_slug_owner(slug: str, user_id: str, is_admin: bool) -> None:
    exists, owner = db.published_owner(slug)
    if not exists:
        raise HTTPException(404, "Página não publicada.")
    if not (owner == user_id or (is_admin and owner is None)):
        raise HTTPException(403, "Essa página pertence a outra conta.")


@app.post("/auth/register")
def auth_register(request: Request, body: dict):
    _rate(request, "reg", 6, 3600)
    try:
        # primeira conta da instalação é o dono: herda (como admin) as páginas órfãs do tempo pré-contas
        role = "admin" if auth.user_count() == 0 else "user"
        user = auth.create_user(str(body.get("email", "")), str(body.get("password", "")), str(body.get("name", "")), role=role)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True, "token": auth.make_token(user), "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}


@app.post("/auth/login")
def auth_login(request: Request, body: dict):
    _rate(request, "login", 15, 60)
    token = auth.login(str(body.get("email", "")), str(body.get("password", "")))
    if not token:
        raise HTTPException(401, "Email ou palavra-passe incorretos.")
    user = auth.get_user_by_email(str(body.get("email", "")))
    return {"ok": True, "token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}


@app.get("/auth/me")
def auth_me(request: Request):
    user = require_user(request)
    fresh = auth.get_user(user["sub"])
    if not fresh:
        raise HTTPException(401, "Sessão inválida.")
    return {"user": {"id": fresh["id"], "email": fresh["email"], "name": fresh["name"], "role": fresh["role"]}}


@app.post("/auth/change-password")
def auth_change_password(request: Request, body: dict):
    """Troca a palavra-passe da sessao ativa (exige a atual — protecao contra token roubado)."""
    _rate(request, "chpass", 8, 60)
    user = require_user(request)
    new = str(body.get("newPassword", ""))
    if len(new) < 8:
        raise HTTPException(422, "A nova palavra-passe tem de ter pelo menos 8 caracteres.")
    if not auth.change_password(user["sub"], str(body.get("oldPassword", "")), new):
        raise HTTPException(401, "A palavra-passe atual nao esta correta.")
    return {"ok": True}


def _seed_from_legacy() -> None:
    """Importa páginas publicadas do sistema antigo (JSONs em SEED_DIR) uma vez."""
    import json
    import os
    seed_dir = config.env("SEED_DIR")
    if not seed_dir or not os.path.isdir(seed_dir):
        return
    for fname in os.listdir(seed_dir):
        if not fname.endswith(".json") or fname.endswith(".leads.jsonl"):
            continue
        slug = fname[:-5]
        if db.get_published(slug):
            continue
        try:
            with open(os.path.join(seed_dir, fname), encoding="utf-8") as f:
                stored = json.load(f)
            page = stored.get("page", stored)
            db.publish_page(slug, page)
            leads_file = os.path.join(seed_dir, f"{slug}.leads.jsonl")
            if os.path.exists(leads_file):
                with open(leads_file, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            db.add_lead(slug, json.loads(line))
        except Exception:
            continue


# ─────────────────────────── health ───────────────────────────


@app.get("/")
def root():
    """A raiz da API não é a app — quem chega aqui pelo browser vai para o frontend."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(config.WEB_APP_URL, status_code=302)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "llm": llm.llm_available(), "pexels": bool(config.PEXELS_API_KEY)}


# ─────────────────────────── agente ───────────────────────────


@app.post("/agent/plan")
async def agent_plan(briefing: Briefing, variants: int = 1):
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    variants = max(1, min(variants, 4))
    plans = await agents.generate_plans(briefing, variants)
    ok = sum(1 for p in plans if p["ok"])
    if ok == 0:
        raise HTTPException(502, plans[0]["error"] if plans else "IA indisponível.")
    return {"plans": [p for p in plans if p["ok"]], "failed": len(plans) - ok, "engine": "fastapi"}


@app.post("/agent/plan/stream")
async def agent_plan_stream(briefing: Briefing, variants: int = 1):
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    variants = max(1, min(variants, 4))
    return StreamingResponse(
        agents.generate_plans_stream(briefing, variants),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/agent/rewrite")
async def agent_rewrite(req: RewriteIn):
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    try:
        return {"source": "ai", "text": await agents.rewrite(req)}
    except Exception as exc:
        raise HTTPException(502, str(exc))


@app.post("/agent/section")
async def agent_section(req: SectionIn):
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    try:
        sec = await agents.create_section(req)
        return {"source": "ai", "section": sec.model_dump()}
    except Exception as exc:
        raise HTTPException(502, str(exc))


@app.post("/agent/interview")
async def agent_interview(briefing: Briefing):
    """Antes de criar: o agente pergunta o que não pode inventar (ou nada, se souber)."""
    if not llm.llm_available():
        return {"summary": "", "questions": []}
    return (await agents.interview(briefing)).model_dump()


@app.post("/agent/image")
async def agent_image(req: ImageIn):
    return await agents.choose_image(req)


@app.post("/agent/theme")
async def agent_theme(req: ThemeIn):
    """Fundo/visual da página toda sem tocar no conteúdo («melhora o fundo»)."""
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    try:
        return {"theme": await agents.page_theme(req)}
    except Exception as exc:
        raise HTTPException(502, str(exc))


@app.post("/agent/intent")
async def agent_intent(req: IntentIn):
    """Chat do editor: PT natural → ação estruturada (executar, não aconselhar)."""
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    try:
        return (await agents.interpret_intent(req)).model_dump()
    except Exception as exc:
        raise HTTPException(502, str(exc))


@app.get("/images/search")
async def images_search(q: str, limit: int = 8):
    """Galeria para o editor: fotos reais por query (Pexels → Openverse → catálogo)."""
    from .services import images
    words = images.slug_words(q) or q
    found = await images.pexels_search(words, max(1, min(limit, 15)))
    if found:
        return {"source": "pexels", "photos": found}
    found = await images.openverse_search(words, max(1, min(limit, 15)))
    if found:
        return {"source": "openverse", "photos": found}
    one = await images.pick_photo(q, [], 0)
    return {"source": one["source"], "photos": [{"url": one["url"], "alt": one["alt"]}]}


# ─────────────────────────── fotos do cliente ───────────────────────────

UPLOAD_MAX = 3 * 1024 * 1024  # 3 MB por foto (o browser já redimensiona)
UPLOAD_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
DOC_MAX = 8 * 1024 * 1024  # PDFs e textos são maiores que fotos
DOC_TYPES = {"application/pdf": ".pdf", "text/plain": ".txt", "text/csv": ".csv"}


def _upload_dir() -> str:
    import os
    d = os.path.join(os.path.dirname(os.path.abspath(config.DB_PATH)), "uploads")
    os.makedirs(d, exist_ok=True)
    return d


@app.post("/upload")
async def upload(request: Request):
    """Foto do cliente → URL absoluta. Corpo cru = bytes da imagem; Content-Type = tipo.

    Sem python-multipart (a imagem docker da cloud não instala dependências novas):
    o frontend envia os bytes diretamente com fetch.
    """
    import os
    import uuid
    require_user(request)
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype not in UPLOAD_TYPES:
        raise HTTPException(400, "Só JPEG, PNG ou WebP.")
    data = await request.body()
    if len(data) > UPLOAD_MAX:
        raise HTTPException(400, "Imagem demasiado grande (máx 3MB).")
    if len(data) < 100:
        raise HTTPException(400, "Ficheiro vazio ou corrompido.")
    name = f"{uuid.uuid4().hex}{UPLOAD_TYPES[ctype]}"
    with open(os.path.join(_upload_dir(), name), "wb") as f:
        f.write(data)
    # URL absoluta: a página publicada vive noutro domínio e precisa de a carregar.
    # Força https (o proxy reporta http interno; as páginas são sempre https).
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return {"ok": True, "url": f"{base}/uploads/{name}"}


@app.post("/upload-doc")
async def upload_doc(request: Request):
    """Documento do cliente (PDF/txt/csv) → URL para o agente citar ou linkar na página."""
    import os
    import uuid
    require_user(request)
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if ctype not in DOC_TYPES:
        raise HTTPException(400, "Só PDF, TXT ou CSV.")
    data = await request.body()
    if len(data) > DOC_MAX:
        raise HTTPException(400, "Ficheiro demasiado grande (máx 8MB).")
    if len(data) < 10:
        raise HTTPException(400, "Ficheiro vazio ou corrompido.")
    name = f"{uuid.uuid4().hex}{DOC_TYPES[ctype]}"
    with open(os.path.join(_upload_dir(), name), "wb") as f:
        f.write(data)
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return {"ok": True, "url": f"{base}/uploads/{name}"}


@app.get("/uploads/{name}")
def uploads_get(name: str):
    import os
    safe = os.path.basename(name)  # sem path traversal
    path = os.path.join(_upload_dir(), safe)
    if not os.path.isfile(path):
        raise HTTPException(404, "Foto não encontrada.")
    return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000"})


# ─────────────────────────── páginas ───────────────────────────


@app.get("/pages")
def pages_list(request: Request):
    user_id, is_admin = _scope(request)
    return {"pages": db.list_pages(user_id, is_admin)}


@app.post("/pages")
def pages_save(page: Page, request: Request):
    user_id, is_admin = _scope(request)
    exists, owner = db.page_owner(page.id)
    if exists and not (owner == user_id or (is_admin and owner is None)):
        raise HTTPException(403, "Essa página pertence a outra conta.")
    db.save_page(page.model_dump(), user_id)
    if page.theme:  # última identidade visual do dono = base das próximas páginas
        db.save_user_style(user_id, page.theme)
    if page.kind == 'studio' and page.html:  # estúdio: memória visual do dono
        from .services import studio as _studio
        db.record_studio(user_id, page.id, _studio.digest(page.html))
    return {"ok": True, "id": page.id}


@app.get("/pages/{page_id}")
def pages_get(page_id: str, request: Request):
    user_id, is_admin = _scope(request)
    _check_page_owner(page_id, user_id, is_admin)
    page = db.get_page(page_id)
    if not page:
        raise HTTPException(404, "Página não encontrada.")
    return {"page": page}


@app.delete("/pages/{page_id}")
def pages_delete(page_id: str, request: Request):
    user_id, is_admin = _scope(request)
    _check_page_owner(page_id, user_id, is_admin)
    db.delete_page(page_id)
    # apagar a página tira-a do ar: cada cópia publicada (e o webhook/leads dela) morre com ela
    off = db.slugs_of_page(page_id)
    for slug in off:
        db.unpublish_page(slug)
        db.delete_webhook(slug)
    return {"ok": True, "unpublished": off}


# ─────────────────────────── publicar ───────────────────────────


@app.post("/publish")
def publish(body: PublishIn, request: Request):
    user_id, is_admin = _scope(request)
    raw = body.page.model_dump_json()
    if len(raw) > SLUG_MAX:
        raise HTTPException(400, "Página demasiado grande para publicar.")
    exists, owner = db.published_owner(body.slug)
    if exists and not (owner == user_id or (is_admin and owner is None)):
        raise HTTPException(403, "Esse slug pertence a outra conta.")
    db.publish_page(body.slug, body.page.model_dump(), user_id)
    return {"ok": True, "slug": body.slug, "url": f"/p/{body.slug}"}


@app.post("/unpublish")
def unpublish(slug_and_body: dict, request: Request):
    user_id, is_admin = _scope(request)
    slug = str(slug_and_body.get("slug", ""))
    _check_slug_owner(slug, user_id, is_admin)
    db.unpublish_page(slug)
    db.delete_webhook(slug)
    return {"ok": True}


@app.get("/published")
def published_list(request: Request):
    user_id, is_admin = _scope(request)
    rows = db.list_published(user_id, is_admin)
    for r in rows:
        r["leads"] = db.count_published_leads(r["slug"])
    return {"pages": rows}


@app.get("/published/{slug}")
def published_get(slug: str):
    stored = db.get_published(slug)
    if not stored:
        raise HTTPException(404, "Página não publicada.")
    return stored


@app.post("/visit")
def visit(body: dict):
    slug = str(body.get("slug", ""))
    visits = db.add_visit(slug)
    if visits is None:
        raise HTTPException(404, "Página não publicada.")
    return {"ok": True, "visits": visits}


# ─────────────────────────── leads ───────────────────────────


@app.post("/leads")
def leads_add(body: LeadIn, background_tasks: BackgroundTasks):
    stored = db.get_published(body.slug)
    if not stored:
        raise HTTPException(404, "Página não publicada.")
    lead = {"sectionId": body.sectionId, "elementId": body.elementId, "values": body.values}
    created_at = db.add_lead(body.slug, lead)
    wh = db.get_webhook(body.slug)
    if wh:
        # Push assinado em background — o formulário nunca espera pelo CRM destino.
        event = webhooks.lead_event(body.slug, stored.get("name", ""), lead, created_at)
        background_tasks.add_task(webhooks.deliver, wh["url"], wh["secret"], event)
    # Mensagem de sucesso vem do próprio formulário publicado.
    message = "Obrigado! Entraremos em contacto."
    for s in stored["page"].get("sections", []):
        if s.get("id") == body.sectionId:
            for el in s.get("elements", []):
                if el.get("id") == body.elementId:
                    message = str((el.get("content") or {}).get("success") or message)
    return {"ok": True, "message": message}


@app.get("/leads")
def leads_list(request: Request, slug: Optional[str] = None):
    user_id, is_admin = _scope(request)
    mine = db.slugs_of(user_id, is_admin)
    if slug is not None:
        if slug not in mine:
            raise HTTPException(403, "Essa página pertence a outra conta.")
        return {"leads": db.get_leads(slug)}
    return {"leads": [l for l in db.get_leads() if l.get("_slug") in mine]}


# ─────────────────────── chaves de API (Settings, JWT) ───────────────────────

@app.get("/account/analytics")
def account_analytics(request: Request):
    """Números reais do servidor: visitas às páginas publicadas + leads por página."""
    user_id, is_admin = _scope(request)
    mine = db.slugs_of(user_id, is_admin)
    pages = db.list_published(None if is_admin else user_id, is_admin)
    leads = [l for l in db.get_leads() if l.get("_slug") in mine]
    per: dict[str, dict] = {}
    for p in pages:
        if p["slug"] in mine:
            per[p["slug"]] = {"slug": p["slug"], "name": p["name"], "visits": int(p["visits"]), "leads": 0}
    for l in leads:
        row = per.setdefault(l.get("_slug", ""), {"slug": l.get("_slug", ""), "name": l.get("_slug", ""), "visits": 0, "leads": 0})
        row["leads"] += 1
    rows = sorted(per.values(), key=lambda r: (-r["leads"], -r["visits"]))
    visits = sum(r["visits"] for r in rows)
    return {"ok": True, "visits": visits, "leads": len(leads),
            "conversion": round(len(leads) / visits * 100, 1) if visits else 0,
            "published": sum(1 for r in rows if r["visits"] or r["slug"] in {p["slug"] for p in pages}),
            "rows": rows}





@app.get("/account/api-keys")
def api_keys_list(request: Request):
    user_id, _ = _scope(request)
    return {"keys": auth.list_api_keys(user_id)}


@app.post("/account/api-keys")
def api_keys_create(request: Request, body: dict):
    user_id, _ = _scope(request)
    if len(auth.list_api_keys(user_id)) >= 10:
        raise HTTPException(400, "Máximo de 10 chaves por conta.")
    rec, raw = auth.create_api_key(user_id, str(body.get("label", "")))
    # A chave crua só aparece aqui, uma vez — na BD vive apenas o hash.
    return {"key": {"id": rec["id"], "label": rec["label"], "prefix": rec["prefix"], "created_at": rec["created_at"]}, "token": raw}


@app.delete("/account/api-keys/{key_id}")
def api_keys_delete(key_id: str, request: Request):
    user_id, _ = _scope(request)
    if not auth.delete_api_key(key_id, user_id):
        raise HTTPException(404, "Chave não encontrada.")
    return {"ok": True}


# ─────────────── redes sociais (tokens do dono, publicação direta) ───────────────


@app.get("/account/social")
def social_status(request: Request):
    """O que está ligado — sem nunca revelar tokens."""
    user_id, _ = _scope(request)
    rows = db.list_social_tokens(user_id)
    out = {r["platform"]: {"connected": True, "label": r.get("label") or ""} for r in rows}
    for plat in ("facebook", "instagram", "linkedin"):
        out.setdefault(plat, {"connected": False, "label": ""})
    return {"platforms": out}


@app.post("/account/social")
async def social_connect(request: Request, body: dict):
    """Liga uma rede: valida o token na plataforma antes de guardar."""
    from .services import social
    user_id, _ = _scope(request)
    platform = str(body.get("platform", "")).strip().lower()
    token = str(body.get("token", "")).strip()
    if platform not in ("facebook", "instagram", "linkedin") or not token:
        raise HTTPException(400, "Rede inválida (facebook, instagram ou linkedin) ou token vazio.")
    label, meta = "", ""
    try:
        if platform in ("facebook", "instagram"):
            info = await social.fb_page_info(token)
            label = info["name"] or info["id"]
            if platform == "instagram":
                ig_id = str(body.get("ig_user_id", "")).strip()
                if not ig_id.isdigit():
                    raise HTTPException(400, "Para o Instagram precisas do ID da conta Business (ligada à Página).")
                meta = ig_id
        else:
            member = await social.li_member_id(token)
            meta = f"urn:li:person:{member}"
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    db.set_social_token(user_id, platform, token, label, meta)
    return {"ok": True, "platform": platform, "label": label}


@app.delete("/account/social/{platform}")
def social_disconnect(platform: str, request: Request):
    user_id, _ = _scope(request)
    if not db.delete_social_token(user_id, platform):
        raise HTTPException(404, "Essa rede não estava ligada.")
    return {"ok": True}


@app.post("/account/social/publish")
async def social_publish(request: Request, body: dict):
    """Publica o link de uma página publicada em todas as redes ligadas (ou nas pedidas)."""
    from .services import social
    user_id, is_admin = _scope(request)
    slug = str(body.get("slug", "")).strip()
    _check_slug_owner(slug, user_id, is_admin)  # 404/403 se não publicada ou não é tua
    stored = db.get_published(slug)
    if not stored:
        raise HTTPException(404, "Página não publicada.")
    origin = _public_origin(request)
    # O link público vive no app web (/p/slug) — o frontend sabe a origem; o
    # fallback é o próprio origin da API atrás do proxy.
    link = str(body.get("url", "")).strip() or f"{origin}/p/{slug}"
    if not link.startswith("https://"):
        raise HTTPException(400, "Link público inválido.")
    name = stored.get("name") or slug
    message = social.build_message(name, link)
    wanted = [str(x).lower() for x in (body.get("platforms") or ["facebook", "instagram", "linkedin"])]
    results = []
    for plat in wanted:
        row = db.get_social_token(user_id, plat)
        if not row:
            results.append({"platform": plat, "ok": False, "detail": "rede não ligada — liga nas Definições"})
            continue
        try:
            if plat == "facebook":
                url = await social.fb_post(row["token"], link, message)
            elif plat == "instagram":
                image = social.pick_image(stored)
                if not image:
                    raise ValueError("a página não tem imagem pública (logótipo/foto) para o Instagram")
                url = await social.ig_post(row["token"], row.get("meta") or "", image, message)
            else:
                url = await social.li_post(row["token"], row.get("meta") or "", link, message)
            results.append({"platform": plat, "ok": True, "detail": url})
        except ValueError as exc:
            results.append({"platform": plat, "ok": False, "detail": str(exc)[:200]})
        except Exception as exc:  # rede/API fora do ar — não rebenta o pedido
            results.append({"platform": plat, "ok": False, "detail": str(exc)[:160]})
    return {"ok": any(r["ok"] for r in results), "results": results}


# ─────────────────── webhooks por página (Settings, JWT) ───────────────────


@app.get("/account/webhooks")
def webhooks_list(request: Request):
    user_id, is_admin = _scope(request)
    hooks = db.list_webhooks(user_id, is_admin)
    for h in hooks:  # última entrega verificada (última hora), vista no Settings
        chk = db.cache_get(f"whcheck:{h['slug']}")
        h["lastDelivery"] = chk[0] if chk else None
    return {"webhooks": hooks}


@app.post("/account/webhooks")
def webhooks_set(request: Request, body: dict):
    """Cria/atualiza o webhook de uma página. O secret é gerado aqui e mostrado uma vez."""
    import secrets as _secrets
    from urllib.parse import urlparse
    user_id, is_admin = _scope(request)
    slug = str(body.get("slug", ""))
    url = str(body.get("url", "")).strip()
    _check_slug_owner(slug, user_id, is_admin)
    if urlparse(url).scheme not in ("http", "https") or not urlparse(url).netloc:
        raise HTTPException(400, "URL do webhook inválida (http/https).")
    secret = "whsec_" + _secrets.token_hex(24)
    db.set_webhook(slug, user_id, url, secret)
    return {"ok": True, "slug": slug, "url": url, "secret": secret}


@app.delete("/account/webhooks/{slug}")
def webhooks_delete(slug: str, request: Request):
    user_id, is_admin = _scope(request)
    _check_slug_owner(slug, user_id, is_admin)
    if not db.delete_webhook(slug):
        raise HTTPException(404, "Webhook não encontrado.")
    return {"ok": True}


@app.post("/crm/v1/webhook-echo")
async def crm_webhook_echo(request: Request, slug: str):
    """Ponto de receção de teste: valida a assinatura com o secret da página e
    guarda o resultado (1h) — o Settings mostra a última entrega verificada.
    Serve também para o E2E cloud provar entrega real sem destino externo."""
    import time
    from hmac import compare_digest
    wh = db.get_webhook(slug)
    if not wh:
        raise HTTPException(404, "Sem webhook nessa página.")
    body = await request.body()
    got = (request.headers.get("x-landing-signature") or "").strip()
    ok = compare_digest(webhooks.signature(wh["secret"], body), got)
    db.cache_put(f"whcheck:{slug}", [{"ok": "1" if ok else "0", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}])
    return {"ok": ok, "event": "echo"}


def _crm_user(request: Request) -> dict:
    """Autenticação da API CRM: header X-API-Key → conta dona da chave."""
    user = auth.user_by_api_key((request.headers.get("x-api-key") or "").strip())
    if not user:
        raise HTTPException(401, "X-API-Key inválida. Cria uma em Settings → API do CRM.")
    return user


# ─────────────────── API CRM/ERP (X-API-Key) ───────────────────
# Contrato do lead (GET /crm/v1/leads):
#   { "slug": "cafe-do-beco", "page": "Café do Beco", "sectionId": "s3",
#     "elementId": "e1", "values": {"nome": "Ana", "email": "ana@x.pt"},
#     "createdAt": "2026-09-24T10:12:33+00:00" }


@app.get("/crm/v1/pages")
def crm_pages(request: Request):
    user = _crm_user(request)
    is_admin = user["role"] == "admin"
    rows = db.list_published(user["id"], is_admin)
    for r in rows:
        r["leads"] = db.count_published_leads(r["slug"])
    return {"pages": rows}


@app.get("/crm/v1/leads")
def crm_leads(request: Request, slug: Optional[str] = None, since: Optional[str] = None):
    """Leads da conta, novos primeiro. since = ISO datetime (ex.: 2026-09-24 ou 2026-09-24T08:00:00Z)."""
    user = _crm_user(request)
    is_admin = user["role"] == "admin"
    mine = db.slugs_of(user["id"], is_admin)
    if slug is not None and slug not in mine:
        raise HTTPException(403, "Essa página pertence a outra conta.")
    names = {r["slug"]: r["name"] for r in db.list_published(user["id"], is_admin)}
    leads = []
    for l in db.get_leads(slug):
        if slug is None and l.get("_slug") not in mine:
            continue
        if since and str(l.get("_createdAt", "")) < since:
            continue
        leads.append({
            "slug": l.get("_slug"), "page": names.get(l.get("_slug"), ""),
            "sectionId": l.get("sectionId"), "elementId": l.get("elementId"),
            "values": l.get("values") or {}, "createdAt": l.get("_createdAt"),
        })
    return {"leads": leads, "count": len(leads)}


# ─────────────────────────── Studio (segundo gerador) ──────────────────────────

_STUDIO_CSP = (
    "default-src 'self' data:; img-src * data: blob:; "
    "style-src 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; "
    "frame-src https://www.google.com; connect-src 'self'; "
    "base-uri 'none'; form-action 'self'"
)


def _public_origin(request: Request) -> str:
    """Origin pública da API atrás do proxy do factorai (X-Forwarded-*).

    O proxy interno declara http mas a plataforma só serve https: um fetch
    http:// a partir duma página https é bloqueado pelo browser (mixed
    content) e o lead morre em silêncio — forçar https em host público.
    """
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if proto == "http" and host and not host.startswith(("localhost", "127.", "[::1]", "0.0.0.0")):
        proto = "https"
    return f"{proto}://{host}".rstrip("/")


@app.post("/agent/design")
async def agent_design(briefing: Briefing, request: Request, seed: int = 0):
    """Studio: cria a página como trabalho em fundo (o proxy corta ligações
    compridas; poll curto nunca morre). Necessita conta."""
    import asyncio
    import time
    import uuid
    user = require_user(request)  # primeiro a conta (401), depois o motor (503)
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    _jobs_prune()
    jid = uuid.uuid4().hex
    job = {"done": False, "t": time.time(), "stage": "a compor"}
    _edit_jobs[jid] = job

    async def _run() -> None:
        for _try in range(2):  # 502/timeout do provider são passageiros: 1 retry grátis
            try:
                job["result"] = {"ok": True, "source": "ai", **await agents._design_once(briefing, max(0, min(seed, 10)), user["sub"])}
                break
            except ValueError as exc:
                job["result"] = {"ok": False, "error": (str(exc).strip() or "a criação não passou na validação")[:300]}
                break
            except Exception as exc:
                msg = str(exc).strip()
                transient = any(c in msg for c in ("502", "503", "504", "overloaded", "timeout", "timed out", "temporarily", "unavailable"))
                if transient and _try == 0:
                    job["stage"] = "o servidor de IA falhou — a tentar outra vez"
                    await asyncio.sleep(5)
                    continue
                job["result"] = {"ok": False, "error": (("O servidor de IA está congestionado — espera uns segundos e tenta outra vez." if transient else (msg or f"o motor de IA falhou ({type(exc).__name__}) — tenta outra vez")))[:300]}
        job["done"] = True
        job["t"] = time.time()

    asyncio.create_task(_run())
    return {"ok": True, "job": jid}


@app.get("/agent/design/runtime")
def design_runtime():
    """O runtime standard do Studio — o editor injeta-o nos previews para que
    páginas gravadas antes de uma melhoria do runtime mostrem já a versão nova."""
    from fastapi.responses import PlainTextResponse
    from .services import studio
    return PlainTextResponse(studio.RUNTIME)


@app.get("/agent/design/{job_id}")
def agent_design_status(job_id: str, request: Request):
    require_user(request)
    job = _edit_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Trabalho não encontrado — tenta de novo.")
    if not job["done"]:
        return {"ok": True, "done": False, "stage": job.get("stage", "a compor")}
    return {"ok": True, "done": True, **job["result"]}





# ───────────── edição studio como trabalho assíncrono (poll curto) ─────────────
# O free tier pensa 1-4 min; qualquer proxy intermediário (100s) cortava a
# ligação SSE e o browser mostrava «network error». POST devolve id já; GET
# /status é um pedido de 2ms — imune a cortes.

_edit_jobs: dict[str, dict] = {}
_EDIT_JOB_MAX = 50


def _jobs_prune() -> None:
    old = [k for k, v in _edit_jobs.items() if v.get("done") and __import__("time").time() - v["t"] > 1800][:_EDIT_JOB_MAX]
    for k in old:
        _edit_jobs.pop(k, None)


@app.post("/agent/design/edit")
async def agent_design_edit(req: DesignEditIn, request: Request):
    """Assistente do editor: trabalho em fundo + poll curto (sem ligação comprida)."""
    import asyncio
    import time
    import uuid
    if not llm.llm_available():
        raise HTTPException(503, "Motor de IA não configurado (AI_API_KEY).")
    require_user(request)
    _jobs_prune()
    jid = uuid.uuid4().hex
    job = {"done": False, "t": time.time()}
    _edit_jobs[jid] = job

    async def _run() -> None:
        job["stage"] = "a pensar"
        for _try in range(2):  # 502/timeout do provider são passageiros: 1 retry grátis
            try:
                job["result"] = {"ok": True, "source": "ai", **await agents.design_edit(req)}
                break
            except ValueError as exc:
                job["result"] = {"ok": False, "error": (str(exc).strip() or "a edição não passou na validação")[:300]}
                break
            except Exception as exc:
                msg = str(exc).strip()
                transient = any(c in msg for c in ("502", "503", "504", "overloaded", "timeout", "timed out", "temporarily", "unavailable"))
                if transient and _try == 0:
                    job["stage"] = "o servidor de IA falhou — a tentar outra vez"
                    await asyncio.sleep(5)
                    continue
                job["result"] = {"ok": False, "error": (("O servidor de IA está congestionado — espera uns segundos e tenta outra vez." if transient else (msg or f"o motor de IA falhou ({type(exc).__name__}) — tenta outra vez")))[:300]}
        job["done"] = True
        job["t"] = __import__("time").time()

    asyncio.create_task(_run())
    return {"ok": True, "job": jid}


@app.get("/agent/design/edit/{job_id}")
def agent_design_edit_status(job_id: str, request: Request):
    require_user(request)
    job = _edit_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Trabalho não encontrado — tenta de novo.")
    if not job["done"]:
        return {"ok": True, "done": False, "stage": job.get("stage", "a pensar")}
    return {"ok": True, "done": True, **job["result"]}


@app.get("/published/{slug}/html")
async def published_studio_html(slug: str, request: Request):
    """Sirve a página studio publicada: runtime fresco (slug/api/whatsapp) + CSP."""
    from fastapi.responses import HTMLResponse
    stored = db.get_published(slug)
    if not stored:
        raise HTTPException(404, "Página não publicada.")
    page = stored.get("page") or {}
    if page.get("kind") != "studio" or not page.get("html"):
        raise HTTPException(404, "Essa página não é do Studio.")
    db.add_visit(slug)
    from .services import studio
    html = studio.inject_runtime(studio.strip_runtime(page["html"]), page.get("phone"),
                                 _public_origin(request), slug)
    return HTMLResponse(html, headers={"Content-Security-Policy": _STUDIO_CSP})


@app.post("/published/{slug}/lead")
async def published_studio_lead(request: Request, slug: str, body: dict, background_tasks: BackgroundTasks):
    _rate(request, "lead", 20, 600)
    """Leads do formulário injetado no studio (mesma mesa dos formulários normais)."""
    stored = db.get_published(slug)
    if not stored:
        raise HTTPException(404, "Página não publicada.")
    values = {str(k)[:40]: str(v)[:500] for k, v in (body or {}).items() if isinstance(v, (str, int, float))}
    if not values:
        raise HTTPException(422, "Formulário vazio.")
    lead = {"sectionId": "studio", "elementId": "lead", "values": values}
    created_at = db.add_lead(slug, lead)
    wh = db.get_webhook(slug)
    if wh:
        event = webhooks.lead_event(slug, stored.get("name", ""), lead, created_at)
        background_tasks.add_task(webhooks.deliver, wh["url"], wh["secret"], event)
    return {"ok": True}
