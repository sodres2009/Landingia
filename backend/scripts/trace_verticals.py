import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
env_file = Path(__file__).resolve().parent.parent.parent / ".env.local"
for line in env_file.read_text(encoding="utf-8").splitlines():
    if line.strip() and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())
os.environ.setdefault("DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "trace.db"))

from app import agents  # noqa: E402
from app.models import Briefing  # noqa: E402


def run(desc, objective):
    plan = asyncio.run(agents._plan_once(Briefing(description=desc, objective=objective, style="Moderno")))
    types = [s.type for s in plan.sections]
    imgs = sum(1 for s in plan.sections for e in s.elements if e["type"] in ("image", "gallery"))
    el_types = {e["type"] for s in plan.sections for e in s.elements}
    print(f"- {desc[:52]:54} secções={types}")
    print(f"    imagens={imgs} elementos={sorted(el_types)}")
    return types


t_clinica = run("clínica dentária no Porto com implantes e ortodontia", "Marcar consultas")
t_evento = run("evento Startup Lisboa 2026, conferência de 2 dias no dia 15 de outubro com oradores e networking", "Vender bilhetes")
t_curso = run("curso online de programação python para iniciantes, 8 módulos, 149 euros com certificado", "Vender inscrições")

assert any("form" in t or "schedule" in t or "contact" in t for t in t_clinica), "clínica sem marcação/contacto"
assert "social" not in t_evento or len(t_evento) >= 5, "evento sem estrutura própria"
assert t_clinica != t_evento != t_curso, "as três verticais geraram a mesma estrutura"
print("ESTRUTURAS DIFERENTES POR VERTICAL — OK")
