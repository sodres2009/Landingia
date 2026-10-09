"""Configuração do backend — tudo por variáveis de ambiente (nunca hardcoded)."""
import os
from pathlib import Path

# Em produção carrega /app/.env (chaves injetadas pelo script de deploy).
for _candidate in (Path("/app/.env"), Path(__file__).resolve().parent.parent / ".env"):
    if _candidate.exists():
        for _line in _candidate.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())
        break


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


# LLM (FactorRouter ou qualquer OpenAI-compatible; Groq continua a servir de fallback)
AI_BASE_URL = env("AI_BASE_URL", "https://api.groq.com/openai/v1")
AI_API_KEY = env("AI_API_KEY")
AI_MODELS = [m.strip() for m in env("AI_MODEL").split(",") if m.strip()] or [""]
AI_MAX_TOKENS = min(max(int(env("AI_MAX_TOKENS", "4000") or 4000), 800), 8000)
AI_TIMEOUT = min(max(int(env("AI_TIMEOUT", "55") or 55), 15), 300)  # s por tentativa
# Identidade da app no FactorRouter (obrigatório no header X-App-Id dos /v1/*)
FACTOR_APP_ID = env("FACTOR_APP_ID", "landing-ai")
# Provedor de recurso (Groq) — usado quando o principal falha todas as tentativas.
FALLBACK_BASE_URL = env("FALLBACK_BASE_URL")
FALLBACK_API_KEY = env("FALLBACK_API_KEY")
FALLBACK_MODELS = [m.strip() for m in env("FALLBACK_MODEL").split(",") if m.strip()] or [""]

# Fotografia real
PEXELS_API_KEY = env("PEXELS_API_KEY")

# Persistência — SQLite. Em produção /data sobrevive a restarts do processo.
DB_PATH = env("DB_PATH", os.path.join(env("DATA_DIR", "."), "landing.db"))

# CORS: origens do frontend (lista separada por vírgulas)
ALLOWED_ORIGINS = [o.strip() for o in env("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
# Frontend público — para onde a raiz da API redirecta quem chega pelo browser.
WEB_APP_URL = env("WEB_APP_URL", "https://app-ed93ae2db29d.factorai.cloud")
