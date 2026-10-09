"""Debug: o LLM devolve theme? cru vs limpo."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for line in (Path(__file__).resolve().parent.parent.parent / ".env.local").read_text(encoding="utf-8").splitlines():
    if line.strip() and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())
os.environ["DB_PATH"] = str(Path(__file__).resolve().parent.parent / "data" / "probe.db")

from app.db import init_db  # noqa: E402
init_db()
from app import agents, llm, prompts  # noqa: E402
from app.models import Briefing  # noqa: E402

async def main():
    b = Briefing(description="App de agendamento para clínicas dentárias em Lisboa, preços desde 40€.", style="Moderno", depth="rich")
    user = prompts.PLAN_USER
    for key, val in {
        "{date}": prompts.date_rule(), "{description}": b.description, "{objective}": b.objective,
        "{style}": b.style, "{context}": "{}", "{answers}": "{}",
        "{size_rules}": prompts.SIZE_RULES_RICH, "{research}": "", "{strategy}": "", "{hint}": "",
    }.items():
        user = user.replace(key, val)
    raw = await llm.ask_json(prompts.SYSTEM_PROMPT, user, agents._RawPlan, max_tokens=6000)
    print("theme cru:", raw.theme)
    print("theme limpo:", agents._clean_theme(raw.theme))

asyncio.run(main())
