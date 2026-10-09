"""Testes de fumo do backend: BD, modelos, imagens curadas e ciclo publicar→lead."""
import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.auth import init_auth_tables  # noqa: E402
from app.services.images import pick_photo, pick_by_tags, slug_words  # noqa: E402

init_db()
init_auth_tables()
client = TestClient(app)


def auth_headers(email="dono@teste.pt"):
    """Conta de teste com token — todas as rotas privadas precisam dela."""
    r = client.post("/auth/register", json={"email": email, "password": "palavra-passe-123", "name": "Dono"})
    if r.status_code != 200:
        r = client.post("/auth/login", json={"email": email, "password": "palavra-passe-123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_router_headers_vao_completos():
    import re as _re
    from app import llm
    h = llm._router_headers("Quero uma landing de ginásio com preço 30€", "plan")
    for required in ("X-App-Id", "X-Turn-Id", "X-Session-Id", "X-Conversation-Id", "X-User-Message",
                     "X-User-Id", "X-User-Name", "X-User-Email", "X-Company-Id", "X-Company-Name"):
        assert h.get(required), f"falta {required}"
    assert _re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}", h["X-Turn-Id"])
    assert h["X-Session-Id"] == "plan"
    assert h["X-User-Id"] == "null" and "%" not in h["X-User-Id"]
    # mensagens com acentos/não-ASCII nunca podem partir o header latin-1
    h2 = llm._router_headers("Café & Construção — orçamento", "plan")
    h2["X-User-Message"].encode("latin-1")
    assert "%" in h2["X-User-Message"]
    # turn-id tem de ser novo por chamada (o router agrega custo por turno)
    assert llm._router_headers("a", "x")["X-Turn-Id"] != llm._router_headers("a", "x")["X-Turn-Id"]


def test_blocos_novos_validam():
    """demo/steps/comparison/quote e o layout bento passam o normalizer."""
    from app.models import Section
    sec = Section.model_validate({
        "id": "s9", "type": "features", "title": "Como funciona",
        "style": {"layout": "bento"},
        "elements": [
            {"id": "e1", "type": "demo", "content": {"title": "App", "items": [{"who": "ai", "text": "Olá"}], "stats": [{"value": "12", "label": "ativos"}]}},
            {"id": "e2", "type": "steps", "content": {"items": [{"title": "Passo", "text": "Faz"}]}},
            {"id": "e3", "type": "comparison", "content": {"left": {"title": "Antes", "items": ["x"]}, "right": {"title": "Depois", "items": ["y"]}}},
            {"id": "e4", "type": "quote", "content": {"text": "Ótimo", "author": "Ana"}},
        ],
    }).normalized()
    assert [e["type"] for e in sec.elements] == ["demo", "steps", "comparison", "quote"]
    assert sec.style.layout == "bento"


def test_chart_footer_e_icones_validam():
    """chart/footer entram no normalizer e icon/caption sobrevivem no content."""
    from app.models import Section
    sec = Section.model_validate({
        "id": "s10", "type": "footer", "title": "Rodapé",
        "elements": [
            {"id": "e1", "type": "chart", "content": {"title": "Tarefas", "items": [{"label": "Marketing", "value": 820}], "unit": " tarefas"}},
            {"id": "e2", "type": "footer", "content": {"cols": [{"title": "Produto", "items": [{"label": "Preços", "url": "#pricing"}]}], "note": "Feito em Portugal"}},
            {"id": "e3", "type": "text", "content": {"text": "Close Agent", "level": "title", "icon": "target", "caption": "7 especialistas · dados reais"}},
        ],
    }).normalized()
    assert [e["type"] for e in sec.elements] == ["chart", "footer", "text"]
    assert sec.elements[2]["content"]["icon"] == "target"
    assert sec.elements[2]["content"]["caption"] == "7 especialistas · dados reais"


def test_checklist_nao_pergunta_dados_do_visitante():
    """Nome/email/whatsapp são papel do formulário — nunca do checklist 'antes de publicar'."""
    from app.agents import _normalize_plan, _RawPlan
    raw = _RawPlan(
        name="X",
        questions=[
            {"key": "a", "question": "Qual é o seu nome?"},
            {"key": "b", "question": "Qual o email ou número de WhatsApp?"},
            {"key": "c", "question": "Qual é o preço da visita de avaliação?"},
        ],
        sections=[{"type": "hero", "title": "H", "elements": [{"type": "text", "content": {"text": "Olá"}}]}],
    )
    plan = _normalize_plan(raw)
    assert [q.question for q in plan.questions] == ["Qual é o preço da visita de avaliação?"]


def test_nif_inventado_nao_entra_na_pagina():
    """Sem NIF no briefing, o normalizador remove-o do footer; com NIF dado, mantém."""
    from app.agents import _normalize_plan, _scrub_fiscal, _RawPlan
    from app.models import Briefing

    def make():
        return _normalize_plan(_RawPlan(
            name="X",
            sections=[{"type": "footer", "title": "F", "elements": [
                {"type": "footer", "content": {"cols": [], "note": "Herdade da Fonte · NIF 297 424 587 · Alvalade"}},
            ]}],
        ))
    briefing = Briefing(description="Restaurante no Alentejo")
    note = _scrub_fiscal(make(), briefing).sections[0].elements[0]["content"]["note"]
    assert "NIF" not in note.upper() and "297" not in note
    assert "Herdade da Fonte" in note and "Alvalade" in note  # o resto do texto fica
    given = Briefing(description="Restaurante, NIF 297424587")
    assert "297 424 587" in _scrub_fiscal(make(), given).sections[0].elements[0]["content"]["note"]


def test_slug_words_traduz_pt():
    assert "car" in slug_words("stand de carros seminovos em coimbra")
    assert "training" in slug_words("academia de treino pessoal")


def test_curated_sem_chave():
    import asyncio
    photo = asyncio.run(pick_photo("stand de carros"))
    assert photo["url"].startswith("https://")
    assert "loremflickr" not in photo["url"]
    photo2 = asyncio.run(pick_by_tags(["office team"], [], 1))
    assert photo2["url"].startswith("https://")
    assert "loremflickr" not in photo2["url"]


PAGE = {
    "id": "pg-1", "name": "Teste", "status": "published",
    "sections": [
        {"id": "s1", "type": "hero", "title": "Hero", "style": {"layout": "hero-split"},
         "elements": [{"id": "e1", "type": "text", "content": {"text": "Olá", "level": "heading"}}]},
        {"id": "s2", "type": "form", "title": "Form", "elements": [
            {"id": "e2", "type": "form", "content": {"title": "Fala", "success": "Recebido!"}}]},
    ],
}


def test_ciclo_publicar_visita_lead():
    auth = auth_headers()
    # publicar exige conta
    assert client.post("/publish", json={"slug": "teste-um", "page": PAGE}).status_code == 401
    r = client.post("/publish", json={"slug": "teste-um", "page": PAGE}, headers=auth)
    assert r.status_code == 200 and r.json()["ok"]
    # visita — público, o visitante não tem conta
    v = client.post("/visit", json={"slug": "teste-um"}).json()
    assert v["ok"] and v["visits"] == 1
    # lead com mensagem do formulário — também anónimo
    l = client.post("/leads", json={"slug": "teste-um", "sectionId": "s2", "elementId": "e2",
                                    "values": {"nome": "Ana", "email": "ana@x.pt"}})
    assert l.status_code == 200 and l.json()["message"] == "Recebido!"
    # o dono vê visita+lead reais; anónimo não vê nada
    rows = client.get("/published", headers=auth).json()["pages"]
    row = next(p for p in rows if p["slug"] == "teste-um")
    assert row["visits"] == 1 and row["leads"] == 1
    assert client.get("/published").status_code == 401
    assert client.get("/leads", headers=auth).json()["leads"][0]["values"]["email"] == "ana@x.pt"
    assert client.get("/leads").status_code == 401
    # página pública
    pub = client.get("/published/teste-um").json()
    assert pub["page"]["name"] == "Teste"
    # visita de slug inexistente → 404
    assert client.post("/visit", json={"slug": "nao-existe"}).status_code == 404


def test_paginas_nao_partilhadas_entre_contas():
    """A conta B não vê nem toca nas páginas da conta A."""
    a, b = auth_headers("dono@teste.pt"), auth_headers("intrusa@teste.pt")
    client.post("/pages", json=PAGE, headers=a)
    ids_b = [p["id"] for p in client.get("/pages", headers=b).json()["pages"]]
    assert "pg-1" not in ids_b
    assert client.get("/pages/pg-1", headers=b).status_code == 403
    assert client.delete("/pages/pg-1", headers=b).status_code == 403
    assert client.post("/publish", json={"slug": "teste-um", "page": PAGE}, headers=b).status_code == 403
    assert client.get("/leads?slug=teste-um", headers=b).status_code == 403
    # mas a página pública continua aberta a todos
    assert client.get("/published/teste-um").status_code == 200


def test_pages_crud():
    auth = auth_headers()
    assert client.post("/pages", json=PAGE, headers=auth).json()["ok"]
    assert client.get("/pages/pg-1", headers=auth).json()["page"]["name"] == "Teste"
    # apagar a página tira a cópia publicada do ar com ela (regressão 25-09: ficava online)
    out = client.delete("/pages/pg-1", headers=auth).json()
    assert out["ok"] and out["unpublished"] == ["teste-um"]
    assert client.get("/pages/pg-1", headers=auth).status_code == 404
    assert client.get("/published/teste-um").status_code == 404
    # re-publicar para os testes seguintes (leads/CRM lêem teste-um)
    assert client.post("/publish", json={"slug": "teste-um", "page": PAGE}, headers=auth).status_code == 200


def test_llm_desligado_devolve_503():
    os.environ.pop("AI_API_KEY", None)
    from app import config
    config.AI_API_KEY = ""
    r = client.post("/agent/rewrite", json={"instruction": "mais curto", "current": "Texto longo aqui."})
    assert r.status_code == 503
    r = client.post("/agent/intent", json={"instruction": "remove os testemunhos", "sections": [{"type": "social", "title": "Quem confia"}]})
    assert r.status_code == 503


def test_intent_schema_valida():
    from app.models import IntentIn, IntentOut
    out = IntentOut.model_validate({"kind": "remove_section", "section_type": "social", "text": None, "position": None, "reply": ""})
    assert out.kind == "remove_section"
    IntentIn.model_validate({"instruction": "muda o título", "sections": [{"type": "hero", "title": "X"}]})


def test_ask_nunca_vira_rewrite_cego():
    """Regressão 26-09: ask sem pergunta tinha de ficar ask — o agente pergunta, não age às cegas."""
    import asyncio
    from app import agents, llm
    from app.models import IntentIn, IntentOut

    async def fake_ask(system, user, schema, **kw):
        return IntentOut(kind="ask", section_type=None, text=None, position=None, reply="")

    orig = llm.ask_json
    llm.ask_json = fake_ask
    try:
        out = asyncio.run(agents.interpret_intent(IntentIn(
            instruction="melhora aquilo", sections=[{"type": "hero", "title": "X"}])))
    finally:
        llm.ask_json = orig
    assert out.kind == "ask"
    assert "secção" in out.reply


def test_image_sem_llm_sai_curada():
    r = client.post("/agent/image", json={"instruction": "equipa jovem num escritório", "exclude": []})
    assert r.status_code == 200
    assert r.json()["url"].startswith("https://")
    assert "loremflickr" not in r.json()["url"]


# ─────────────────────────── entrevista + fotos do cliente ───────────────────────────


def _fake_llm_replies_json(payload):
    async def fake_chat(system, user, **kw):
        return payload
    return fake_chat


def test_scrub_telefones_inventados():
    """Telefone só passa na página se o cliente o escreveu no briefing (regressão 25-09)."""
    from app import agents
    from app.models import Briefing, PlanOut

    def plan_with(text):
        return PlanOut(name="X", sections=[{
            "id": "s1", "type": "contact", "title": "Contactos", "style": {},
            "elements": [{"id": "e1", "type": "text", "content": {"text": text, "level": "body"}}],
        }])

    b_sem = Briefing(description="Estúdio de fotografia no Porto")
    out = agents._scrub_phones(plan_with("Liga para +351 912 345 678 para marcar."), b_sem)
    assert "912 345 678" not in out.sections[0].elements[0]["content"]["text"]

    b_com = Briefing(description="Estúdio no Porto, telemóvel 912 345 678")
    out2 = agents._scrub_phones(plan_with("Ligue 912 345 678."), b_com)
    assert "912 345 678" in out2.sections[0].elements[0]["content"]["text"]
    # URLs de fotos não são mexidos
    out3 = agents._scrub_phones(PlanOut(name="X", sections=[{
        "id": "s1", "type": "hero", "title": "t", "style": {},
        "elements": [{"id": "e1", "type": "image", "content": {"url": "https://images.pexels.com/photos/912345678/p.jpg", "alt": "x"}}],
    }]), b_sem)
    assert "912345678" in out3.sections[0].elements[0]["content"]["url"]


def test_agente_le_a_conversa_e_a_imagem_atual():
    """Follow-ups («fica melhor») chegam ao agente com histórico e contexto da imagem."""
    import asyncio
    from app import llm
    from app import agents
    from app.models import ImageIn, IntentIn

    seen = {}

    async def spy_intent(system, user, schema, **kw):
        seen["intent"] = user
        return schema.model_validate({"kind": "image", "section_type": "gallery"})

    async def spy_tags(system, user, schema, **kw):
        seen["tags"] = user
        return schema.model_validate({"tags": ["grilled sandwich"], "alt": "Tosta mista"})

    orig_i, orig_t = llm.ask_json, None
    llm.ask_json = spy_intent
    try:
        asyncio.run(agents.interpret_intent(IntentIn(
            instruction="fica um pouco melhor",
            history=[{"role": "user", "text": "põe uma foto do prato assinatura"},
                     {"role": "bot", "text": "✓ Alteração aplicada"}],
            sections=[{"type": "gallery", "title": "Os nossos pratos", "excerpt": "[imagem: tostas]"}],
        )))
    finally:
        llm.ask_json = orig_i
    assert "CONVERSA RECENTE" in seen["intent"] and "foto do prato assinatura" in seen["intent"]

    from app.services import images
    orig_pick = images.pick_or_generate
    picked = {}

    async def spy_pick(query, exclude, n):
        picked["query"] = query
        return {"url": "http://x/y.jpg", "alt": "x", "source": "pexels"}

    llm.ask_json = spy_tags
    images.pick_or_generate = spy_pick
    try:
        asyncio.run(agents.choose_image(ImageIn(instruction="fica melhor", previous="Tosta mista no balcão do café")))
    finally:
        llm.ask_json, images.pick_or_generate = orig_i, orig_pick
    assert "IMAGEM ATUAL" in seen["tags"] and "Tosta mista" in seen["tags"]
    # fallback sem LLM: ajuste vago pesquisa pelo assunto da imagem, não pela frase «fica melhor»
    async def dead_llm(*a, **kw):
        raise RuntimeError("modelo em baixo")
    llm.ask_json = dead_llm
    images.pick_or_generate = spy_pick
    try:
        asyncio.run(agents.choose_image(ImageIn(instruction="fica melhor", previous="Tosta mista no balcão do café")))
    finally:
        llm.ask_json, images.pick_or_generate = orig_i, orig_pick
    assert "Tosta mista" in picked["query"]


def test_interview_pergunta_o_que_falta():
    import asyncio
    from app import agents, llm
    from app.models import Briefing
    orig = llm.chat
    llm.chat = _fake_llm_replies_json(
        '{"summary":"Clínica de dentista no Porto.","questions":['
        '{"key":"preco","question":"Quanto custa a consulta de avaliação?","why":"Dá um preço real.","needs":"text"},'
        '{"key":"fotos","question":"Tens fotos do teu espaço? Podes anexar.","why":"Mostra o espaço real.","needs":"photo"}]}'
    )
    try:
        out = asyncio.run(agents.interview(Briefing(
            description="Clínica de dentista no Porto, equipa de 4 médicos.")))
    finally:
        llm.chat = orig
    assert out.summary.startswith("Clínica")
    assert [q.needs for q in out.questions] == ["text", "photo"]


def test_interview_nao_pergunta_o_que_o_briefing_ja_deu():
    """Telefone/email/preço já dados no briefing → perguntas correspondentes caem."""
    import asyncio
    from app import agents, llm
    from app.models import Briefing
    orig = llm.chat
    llm.chat = _fake_llm_replies_json(
        '{"summary":"Restaurante.",'
        '"questions":['
        '{"key":"tel","question":"Qual é o número de telefone para reservas?","why":"Contacto real.","needs":"text"},'
        '{"key":"mail","question":"Qual o email de contacto?","why":"Contacto real.","needs":"text"},'
        '{"key":"preco","question":"Quanto custa uma refeição?","why":"Preço real.","needs":"text"},'
        '{"key":"fotos","question":"Tens fotos do teu espaço? Podes anexar.","why":"Mostra o espaço.","needs":"photo"}]}'
    )
    try:
        out = asyncio.run(agents.interview(Briefing(
            description="Restaurante no Alentejo. Reservas pelo 266 000 000 "
                        "ou reservas@restaurante.pt. Refeições 15€ a 22€.")))
    finally:
        llm.chat = orig
    assert [q.key for q in out.questions] == ["fotos"]


def test_interview_briefing_vago_nunca_fica_sem_pergunta():
    import asyncio
    from app import agents, llm
    from app.models import Briefing
    orig = llm.chat
    llm.chat = _fake_llm_replies_json('{"summary":"App qualquer.","questions":[]}')
    try:
        out = asyncio.run(agents.interview(Briefing(description="app de agendamento")))
    finally:
        llm.chat = orig
    assert len(out.questions) == 1


def test_interview_sem_llm_nao_bloqueia():
    import asyncio
    from app import agents, config, llm
    from app.models import Briefing
    orig_key, orig_avail = config.AI_API_KEY, llm.llm_available
    config.AI_API_KEY = ""
    try:
        out = asyncio.run(agents.interview(Briefing(description="negócio qualquer")))
        assert isinstance(out.questions, list)  # não rebenta sem IA
    finally:
        config.AI_API_KEY = orig_key


def test_apply_images_usa_foto_do_cliente_primeiro():
    import asyncio
    from app import agents
    from app.models import PlanOut

    async def fake_pick(query, role, exclude=None, seed=0):
        return {"url": "https://stock.example/foto.jpg", "alt": "", "source": "curated"}

    orig = agents.images.pick_for_role
    agents.images.pick_for_role = fake_pick
    try:
        plan = PlanOut(name="t", sections=[
            {"id": "a", "type": "hero", "title": "h", "elements": [
                {"id": "i1", "type": "image", "content": {"url": "", "alt": "sala"}},
                {"id": "i2", "type": "image", "content": {"url": "", "alt": "balcao"}},
            ]},
        ])
        out = asyncio.run(agents.apply_images(plan, ["http://api/uploads/foto-cliente.jpg"]))
    finally:
        agents.images.pick_for_role = orig
    els = out.sections[0].elements
    assert els[0]["content"]["url"] == "http://api/uploads/foto-cliente.jpg"
    assert els[1]["content"]["url"] == "https://stock.example/foto.jpg"  # sem foto do cliente → pesquisa


def test_foto_irrelevante_nao_passa_na_pexels():
    """Portão de relevância também na Pexels: cegonha num telhado não serve «moda»."""
    import asyncio
    from app.services import images

    async def fake_pexels(query, count=8):
        # cenário real: pedimos moda, a Pexels devolve uma cegonha num telhado
        return [{"url": "https://images.pexels.com/stork-roof.jpg", "alt": "Stork nesting on rooftop"}]

    async def fake_openverse(query, count=10, page=1):
        return []

    orig_px, orig_ov = images.pexels_search, images.openverse_search
    images.pexels_search, images.openverse_search = fake_pexels, fake_openverse
    try:
        picked = asyncio.run(images.pick_or_generate("apresentacao colecao capsula moda", exclude=[]))
        # nada relevante na pesquisa → catálogo moda (ou geração), nunca a cegonha
        assert "stork-roof" not in picked["url"]
        # e quando a pesquisa BATE no alt, essa foto vence o catálogo:
        async def fake_fashion(query, count=8):
            return [{"url": "https://images.pexels.com/fashion.jpg", "alt": "Fashion week runway model"}]
        images.pexels_search = fake_fashion
        hit = asyncio.run(images.pick_or_generate("fashion collection", exclude=[]))
        assert hit["url"] == "https://images.pexels.com/fashion.jpg"
    finally:
        images.pexels_search, images.openverse_search = orig_px, orig_ov


def test_upload_doc_pdf_txt():
    """Anexo de briefing: PDF/TXT aceito, exe recusado, size check. Upload exige conta."""
    auth = auth_headers()
    assert client.post("/upload-doc", content=b"%PDF-1.4 fake pdf content 1234",
                       headers={"content-type": "application/pdf"}).status_code == 401
    r = client.post("/upload-doc", content=b"%PDF-1.4 fake pdf content 1234",
                    headers={"content-type": "application/pdf", **auth})
    assert r.status_code == 200 and r.json()["url"].endswith(".pdf")
    slug = r.json()["url"].split("/uploads/")[1]
    assert client.get(f"/uploads/{slug}").status_code == 200  # servir é público (a página publicada usa o URL)
    bad = client.post("/upload-doc", content=b"MZ\x00\x00", headers={"content-type": "application/x-msdownload", **auth})
    assert bad.status_code == 400


def test_upload_foto_cliente():
    auth = auth_headers()
    png = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 200
    r = client.post("/upload", content=png, headers={"content-type": "image/png", **auth})
    assert r.status_code == 200, r.text
    url = r.json()["url"]
    assert "/uploads/" in url and url.endswith(".png")
    g = client.get(url.split("testclient")[-1])
    assert g.status_code == 200
    bad = client.post("/upload", content=b"texto " * 60, headers={"content-type": "text/plain", **auth})
    assert bad.status_code == 400


# ─────────────────────────── API CRM/ERP (Fase 3) ───────────────────────────


def test_webhook_echo_verifica_assinatura():
    """O destino de teste /crm/v1/webhook-echo valida o HMAC e o Settings mostra o resultado."""
    from app.services import webhooks as whmod
    auth = auth_headers()
    r = client.post("/account/webhooks", json={"slug": "teste-um", "url": "http://api/crm/v1/webhook-echo?slug=teste-um"}, headers=auth)
    secret = r.json()["secret"]
    body = b'{"event":"lead.created","lead":{"slug":"teste-um","values":{}}}'
    hdr = {"content-type": "application/json"}
    good = client.post("/crm/v1/webhook-echo?slug=teste-um", content=body,
                       headers={**hdr, "X-Landing-Signature": whmod.signature(secret, body)})
    assert good.json()["ok"] is True
    bad = client.post("/crm/v1/webhook-echo?slug=teste-um", content=body,
                      headers={**hdr, "X-Landing-Signature": "sha256=0" * 8})
    assert bad.json()["ok"] is False  # nem rebenta, nem aceita
    hook = next(h for h in client.get("/account/webhooks", headers=auth).json()["webhooks"] if h["slug"] == "teste-um")
    assert hook["lastDelivery"]["ok"] == "0"  # última escrita ganha — visível no Settings
    client.delete("/account/webhooks/teste-um", headers=auth)


def test_crm_api_pull_completo():
    """Chave criada no Settings → puxar páginas e leads com o contrato combinado."""
    auth = auth_headers()
    assert client.get("/account/api-keys").status_code == 401  # gestão exige sessão
    created = client.post("/account/api-keys", json={"label": "meu CRM"}, headers=auth)
    assert created.status_code == 200
    raw = created.json()["token"]
    assert raw.startswith("la_")
    key_id = created.json()["key"]["id"]
    assert raw not in str(client.get("/account/api-keys", headers=auth).json())  # lista só mostra o prefixo
    kr = {"X-API-Key": raw}
    # lead publicado de novo (apagar/despublicar limpa leads — teste_pages_crud re-publicou a página)
    assert client.post("/leads", json={"slug": "teste-um", "sectionId": "s2", "elementId": "e2",
                                       "values": {"nome": "Ana", "email": "ana@x.pt"}}).status_code == 200
    # páginas da conta
    pages = client.get("/crm/v1/pages", headers=kr).json()["pages"]
    assert any(p["slug"] == "teste-um" and p["leads"] >= 1 for p in pages)
    # contrato do lead
    leads = client.get("/crm/v1/leads", headers=kr).json()
    assert leads["count"] == len(leads["leads"]) >= 1
    first = leads["leads"][0]
    assert set(first) == {"slug", "page", "sectionId", "elementId", "values", "createdAt"}
    assert first["values"]["email"] == "ana@x.pt" and first["createdAt"]
    # filtros: slug ok, since do futuro esvazia
    assert client.get("/crm/v1/leads?slug=teste-um", headers=kr).status_code == 200
    assert client.get("/crm/v1/leads?since=2099-01-01", headers=kr).json()["count"] == 0
    # autenticação: sem chave / chave errada / chave alheia
    assert client.get("/crm/v1/leads").status_code == 401
    assert client.get("/crm/v1/leads", headers={"X-API-Key": "la_lixo"}).status_code == 401
    outros = auth_headers("intruso@teste.pt")
    assert client.get("/crm/v1/leads?slug=teste-um",
                      headers={"X-API-Key": client.post("/account/api-keys", json={}, headers=outros).json()["token"]}).status_code == 403
    # revogar apaga o acesso
    assert client.delete(f"/account/api-keys/{key_id}", headers=auth).json()["ok"]
    assert client.get("/crm/v1/leads", headers=kr).status_code == 401


def test_webhook_gestao_e_disparo():
    """Settings define webhook por página; cada lead novo entrega em background."""
    import app.services.webhooks as whmod
    auth = auth_headers()
    assert client.post("/account/webhooks", json={"slug": "nao-existe", "url": "https://x.pt/h"}, headers=auth).status_code == 404
    assert client.post("/account/webhooks", json={"slug": "teste-um", "url": "ftp://inseguro"}, headers=auth).status_code == 400
    outro = auth_headers("intruso2@teste.pt")
    assert client.post("/account/webhooks", json={"slug": "teste-um", "url": "https://x.pt/h"}, headers=outro).status_code == 403
    r = client.post("/account/webhooks", json={"slug": "teste-um", "url": "https://crm.example/hook"}, headers=auth)
    assert r.status_code == 200
    secret = r.json()["secret"]
    assert secret.startswith("whsec_")
    assert secret not in str(client.get("/account/webhooks", headers=auth).json())  # mostrado uma vez
    # disparo: POST /leads público → deliver em background com o evento do contrato
    seen = []
    orig = whmod.deliver
    whmod.deliver = lambda url, sec, ev, **kw: seen.append((url, sec, ev)) or True
    try:
        assert client.post("/leads", json={"slug": "teste-um", "sectionId": "s2", "elementId": "e2",
                                           "values": {"email": "web@x.pt"}}).status_code == 200
    finally:
        whmod.deliver = orig
    assert seen and seen[0][0] == "https://crm.example/hook" and seen[0][1] == secret
    ev = seen[0][2]
    assert ev["event"] == "lead.created" and ev["lead"]["values"]["email"] == "web@x.pt"
    assert ev["lead"]["createdAt"] and ev["lead"]["slug"] == "teste-um"
    assert client.delete("/account/webhooks/teste-um", headers=auth).json()["ok"]


def test_webhook_deliver_assinatura_e_retries():
    """Assinatura HMAC-SHA256 verificável pelo destino; 2 retries silenciosos."""
    import hashlib
    import hmac as _hmac

    from app.services import webhooks as whmod

    ev = whmod.lead_event("cafe", "Café", {"sectionId": "s", "elementId": "e", "values": {"n": "Ana"}}, "2026-09-24T10:00:00+00:00")
    secret = "whsec_teste"
    calls, slept = [], []

    class Resp:
        status_code = 200

    def post_ok(url, content=None, headers=None, timeout=None):
        calls.append((content, headers))
        return Resp()

    assert whmod.deliver("https://crm.example/h", secret, ev, post=post_ok, sleep=slept.append)
    content, headers = calls[0]
    expected = "sha256=" + _hmac.new(secret.encode(), content, hashlib.sha256).hexdigest()
    assert headers["X-Landing-Signature"] == expected  # o destino valida bytes crua, não JSON re-serializado
    assert headers["X-Landing-Event"] == "lead.created"

    def post_falha(url, content=None, headers=None, timeout=None):
        calls.append((content, headers))
        raise RuntimeError("destino cai")

    ok = whmod.deliver("https://crm.example/h", secret, ev, post=post_falha, sleep=slept.append)
    assert ok is False and len(calls) == 4 and slept == [2.0, 5.0]  # 1+2 tentativas, silencioso: nunca lança


# ─────────────────────────── contas ───────────────────────────


def test_ciclo_conta_completo():
    """registar → token → /auth/me → login errado → email duplicado."""
    r = client.post("/auth/register", json={"email": "ana@teste.pt", "password": "palavra-passe-123", "name": "Ana"})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["user"]["email"] == "ana@teste.pt"
    # token falso / manipulado → 401
    fake = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {fake}"}).status_code == 401
    assert client.get("/auth/me").status_code == 401
    # login com password errada
    assert client.post("/auth/login", json={"email": "ana@teste.pt", "password": "errada-errada-1"}).status_code == 401
    ok = client.post("/auth/login", json={"email": "ANA@teste.pt", "password": "palavra-passe-123"})
    assert ok.status_code == 200 and ok.json()["token"]
    # duplicado e regras fracas
    assert client.post("/auth/register", json={"email": "ana@teste.pt", "password": "12345678"}).status_code == 400
    assert client.post("/auth/register", json={"email": "sem-arroba", "password": "12345678"}).status_code == 400
    assert client.post("/auth/register", json={"email": "bebe@teste.pt", "password": "curta"}).status_code == 400


def test_token_nao_valida_fora_do_segredo():
    """Um token assinado com outro segredo (ex.: outra instalação) não vale aqui."""
    from app import auth
    import base64, json as _json
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(_json.dumps({"sub": "x", "email": "x@x.pt", "exp": 9e12}).encode()).rstrip(b"=").decode()
    assert auth.read_token(f"{header}.{payload}.assINaturaFalsa") is None
