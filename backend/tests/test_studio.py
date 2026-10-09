"""Testes do Studio: sanitizador, runtime, kit de contacto, anti-repetição e rotas.

O Studio é o único caminho do app que serve HTML gerado por IA a visitantes
anónimos — tudo o que aqui se testa é a garantia de que o modelo nunca manda
JS arbitrária nem inventa contactos/prazos.
"""
import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "studio.db")

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.auth import init_auth_tables  # noqa: E402
from app.db import init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services import studio  # noqa: E402

init_db()
init_auth_tables()
client = TestClient(app)

PAGE = ("<html><head><style>a{color:#112233}</style></head><body>"
        "<h1>FEIRÃO DS AUTO</h1><p>Rua da Lagoa, Aveiro</p>"
        "<form data-lead data-success='Ok'><input name='nome'></form>"
        "</body></html>")


# ── sanitização ────────────────────────────────────────────────────────────────

def test_sanitize_remove_js_e_iframes():
    evil = ("<html><body><script>alert(1)</script><b onclick='x()'>t</b>"
            "<a href='javascript:alert(2)'>j</a><iframe src='https://evil'></iframe>"
            "<object data='x'></object>ola</body></html>")
    s = studio.sanitize_html(evil)
    assert "alert" not in s and "<iframe" not in s.lower() and "javascript:" not in s
    assert "onclick" not in s and "<object" not in s.lower()
    assert "ola" in s  # conteúdo real sobrevive


def test_forms_sem_marcador_nao_enviam():
    s = studio.sanitize_html("<body><form action='/steal'><input></form><form data-lead><input></form></body>")
    assert "action=" not in s
    assert "<form" not in s.split("data-lead")[0].lower() or "<div" in s.lower()
    assert "form data-lead" in s.replace("<form data-lead", "form data-lead").lower()


def test_extract_html_lida_com_fence():
    raw = "Claro! Aqui está:\n```html\n<!DOCTYPE html><html><body>oi</body></html>\n```\nEspero que ajude."
    assert studio.extract_html(raw).startswith("<!DOCTYPE")


# ── runtime ────────────────────────────────────────────────────────────────────

def test_runtime_injeta_e_strip_remove():
    with_rt = studio.inject_runtime(PAGE, "351912345678", "https://api.x", "abc")
    assert 'name="lp-wa"' in with_rt and "lp-api" in with_rt and "data-studio" in with_rt
    limpo = studio.strip_runtime(with_rt)
    assert "lp-wa" not in limpo and "data-studio" not in limpo and "FEIRÃO" in limpo
    # dupla injecção não duplica
    again = studio.inject_runtime(limpo, "351912345678")
    assert again.count("data-studio") == with_rt.count("data-studio")


# ── kit de contacto ────────────────────────────────────────────────────────────

def test_kit_exige_whatsapp_quando_briefing_deu_telefone():
    # o pipeline real valida o output do modelo ANTES de injetar runtime
    briefing = "stand com whatsapp 910689700"
    assert any("WhatsApp" in e for e in studio.validate_kit(PAGE, briefing))
    com_link = PAGE.replace("<p>Rua", "<a href='https://wa.me/351910689700'>Falar</a><p>Rua")
    assert studio.validate_kit(com_link, briefing) == []


def test_countdown_so_com_data_do_briefing():
    bad = studio.inject_runtime("<html><body><div data-countdown='2031-12-24T23:59'></div></body></html>", None)
    assert any("inventes" in e for e in studio.validate_kit(bad, "feirão de 5 a 9 de maio"))
    ok = studio.inject_runtime("<html><body><div data-countdown='2026-05-09T23:59'></div></body></html>", None)
    assert studio.validate_kit(ok, "feirão de 5 a 9 de maio") == []


def test_nif_inventado_bloqueado():
    h = "<html><body>NIF 987 654 321</body></html>"
    assert any("NIF" in e for e in studio.validate_kit(h, "stand de carros"))
    assert studio.validate_kit(h, "o nosso NIF é 987 654 321") == []


def test_mapa_ganha_cidade_e_portugal():
    fixed = studio.map_query_fix('data-map="rua da lagoa"', "stand na rua da lagoa, 3810 Aveiro")
    assert "Aveiro" in fixed and "Portugal" in fixed


# ── anti-repetição ─────────────────────────────────────────────────────────────

def test_digest_e_anti_repeat():
    d1 = studio.digest('<html><h1>FEIRÃO</h1><style>x{font-family:Georgia;color:#aabbcc}</style>#aabbcc</html>')
    assert d1["hero"] == "FEIRÃO" and "#aabbcc" in d1["palette"] or d1["palette"] == ["aabbcc"]
    bloco = studio.anti_repeat_block([d1])
    assert "ANTI-REPETIÇÃO" in bloco and "FEIRÃO" in bloco
    assert studio.anti_repeat_block([]) == ""


# ── rotas ──────────────────────────────────────────────────────────────────────

def test_design_exige_conta():
    r = client.post("/agent/design", json={"description": "stand de carros na covilha"})
    assert r.status_code == 401


def test_publicar_e_servir_pagina_studio():
    h = {"Authorization": "Bearer " + client.post("/auth/register", json={
        "email": "studio@teste.pt", "password": "palavra-passe-123", "name": "S"}).json()["token"]}
    page = {"id": "pstudio1", "name": "Feirão", "status": "published", "kind": "studio",
            "html": studio.strip_runtime(studio.inject_runtime(PAGE, "351910689700")),
            "phone": "351910689700", "sections": []}
    assert client.post("/pages", json=page, headers=h).status_code == 200
    assert client.post("/publish", json={"slug": "feirao-st", "page": page}, headers=h).status_code == 200
    # histórico anti-repetição foi registado ao guardar
    assert db.recent_studio_digests(db.page_owner("pstudio1")[1])
    # servida com CSP + runtime fresco + visita contada
    r = client.get("/published/feirao-st/html")
    assert r.status_code == 200
    assert "Content-Security-Policy" in r.headers
    assert 'name="lp-slug" content="feirao-st"' in r.text and "FEIRÃO" in r.text
    assert db.get_published("feirao-st")["visits"] == 1
    # páginas normais não respondem por /html
    assert client.get("/published/nao-existe/html").status_code == 404


def test_lead_do_studio_chega_a_mesa_dos_leads():
    r = client.post("/published/feirao-st/lead", json={"nome": "Bruno", "tel": "910000000"})
    assert r.status_code == 200
    r = client.get("/leads?slug=feirao-st",
                   headers={"Authorization": "Bearer " + client.post("/auth/login", json={
                       "email": "studio@teste.pt", "password": "palavra-passe-123"}).json()["token"]})
    assert r.status_code == 200
    leads = r.json()["leads"]
    assert any(l["values"].get("nome") == "Bruno" for l in leads)
