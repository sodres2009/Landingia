"""Geração de imagem: pedido específico sem foto real deve vir source=ai."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("AI_PROVIDER", "none")
os.environ["DB_PATH"] = str(Path(__file__).resolve().parent.parent / "data" / "probe.db")

from app.db import init_db  # noqa: E402
init_db()
from app.services import images  # noqa: E402

async def main():
    for q in ["quadro abstrato com ondas de café numa parede de tijolo", "estufa de plantas tropicais com cliente a escolher"]:
        out = await images.pick_or_generate(q, [], 0)
        print(f"{q[:40]!r} → {out['source']}: {out['url'][:80]}")

asyncio.run(main())
