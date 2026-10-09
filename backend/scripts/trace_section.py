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
from app.models import SectionIn  # noqa: E402

req = SectionIn(description="secção com os horários das aulas", objective="Marcar aula",
                context={"productSummary": "academia de jiu-jitsu"})
try:
    sec = asyncio.run(agents.create_section(req))
    print("OK tipo:", sec.type, "elementos:", len(sec.elements))
except Exception:
    import traceback
    traceback.print_exc()
