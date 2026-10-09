"""Portão de relevância: 3 pedidos de foto — têm de vir relevantes ou do catálogo."""
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
from app.services import images  # noqa: E402

async def main():
    for q in ["foto da sala de refeições do restaurante", "estúdio de jiu-jitsu com tapumes", "barbearia clássica cadeira"]:
        used: list[str] = []
        outs = []
        for _ in range(3):
            p = await images.pick_photo(q, used, 0)
            used.append(p["url"])
            outs.append(f"{p['source']}:{p['url'][:60]}")
        print(f"{q!r}\n  " + "\n  ".join(outs))

asyncio.run(main())
