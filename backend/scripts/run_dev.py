"""Arranca o backend em dev lendo o .env.local do app Next (mesmas chaves)."""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # backend/
ENV_FILE = HERE.parent / ".env.local"

env = os.environ.copy()
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
env.setdefault("DB_PATH", str(HERE / "data" / "landing-dev.db"))
env["ALLOWED_ORIGINS"] = "http://localhost:3005,http://127.0.0.1:3005"

port = sys.argv[1] if len(sys.argv) > 1 else "8100"
os.chdir(HERE)
subprocess.run([str(HERE / ".venv" / "Scripts" / "python.exe"), "-m", "uvicorn", "app.main:app",
                "--host", "127.0.0.1", "--port", port], env=env)
