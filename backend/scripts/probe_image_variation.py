"""Prova de variação: três pedidos seguidos com o mesmo tema, fotos distintas."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["DB_PATH"] = str(Path(__file__).resolve().parent.parent / "data" / "probe.db")

from app.db import init_db  # noqa: E402
init_db()
from app.services.images import pick_by_tags  # noqa: E402

async def main():
    a = await pick_by_tags(["jiu jitsu", "training"], [])
    b = await pick_by_tags(["jiu jitsu", "training"], [a["url"]])
    c = await pick_by_tags(["jiu jitsu", "training"], [a["url"], b["url"]])
    for label, p in (("1", a), ("2", b), ("3", c)):
        print(f"{label}: {p['source']:10} {p['url'][:95]}")
    urls = {a["url"], b["url"], c["url"]}
    assert len(urls) == 3, "MESMA FOTO REPETIDA!"
    assert all("loremflickr" not in u for u in urls)
    print("VARIACAO OK — 3 fotos distintas para o mesmo tema")

asyncio.run(main())
