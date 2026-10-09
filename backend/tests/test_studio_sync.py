"""Sincronia obrigatória dos três agentes (regra do Bruno, 28-09).

Qualquer regra nova dos prompts tem de viver na FONTE ÚNICA (prompts.py /
services.studio) e chegar aos três cérebros: PLAN (criação), INTENT/REWRITE
(assistente do editor) e DESIGN (studio). Este teste é o mecanismo: se alguém
colar uma regra num prompt sem a pôr na fonte, o pytest rebenta.
"""
import inspect

from app import agents, prompts
from app.services import studio


def test_design_usa_o_mesmo_playbook():
    system = studio.design_system()
    assert prompts.LANDING_PLAYBOOK in system, "o Studio tem de carregar o playbook comum"


def test_plan_usa_o_mesmo_playbook():
    assert prompts.LANDING_PLAYBOOK in prompts.SYSTEM_PROMPT


def test_design_system_tem_as_marca_de_sync():
    system = studio.design_system()
    for marker in studio.SYNC_MARKERS:
        assert marker in system, f"falta a marca de sincronia «{marker}» no system do design"


def test_assistente_e_mesmo_cerebro():
    assert "MESMO CÉREBRO" in prompts.INTENT_SYSTEM
    assert "NOMES" in prompts.INTENT_SYSTEM
    assert "NOMES" in prompts.REWRITE_SYSTEM or "CONVERSÃO" in prompts.REWRITE_SYSTEM


def test_todos_os_prompts_proíbem_toponimos_inventados():
    for name in ("SYSTEM_PROMPT", "INTENT_SYSTEM", "REWRITE_SYSTEM"):
        assert "NOMES" in getattr(prompts, name), f"{name} perdeu a regra dos nomes exactos"
    assert "NOMES" in studio.design_system()


def test_objectivo_e_estilo_têm_foco_real_em_ambos_os_geradores():
    # plan e studio recebem o foco através das mesmas funções — se um deixar de
    # as usar, o teste apanha.
    src = inspect.getsource(agents)
    assert src.count("prompts.objective_focus(") >= 2, "plan e design têm de usar objective_focus"
    assert src.count("prompts.style_direction(") >= 1
    assert "MEMÓRIA DE ESTILO" in src
    # design_user tem de receber memória + anti-repetição + semente
    u = studio.design_user("b", "o", "s", "est", "site", "MEMÓRIA DE ESTILO x",
                           studio.anti_repeat_block([{"palette": ["#111111"]}]),
                           studio.art_seed(0), "DATA")
    assert "MEMÓRIA DE ESTILO" in u and "ANTI-REPETIÇÃO" in u and "DIREÇÃO ARTÍSTICA" in u


def test_herda_do_cliente_chega_aos_tres():
    assert "HERDA DO CLIENTE" in prompts.THEME_RULES        # plan
    assert "HERDA DO CLIENTE" in studio.DESIGN_CONTRACT      # studio
    assert "palavras exatas do cliente" in prompts.INTENT_SYSTEM  # assistente
