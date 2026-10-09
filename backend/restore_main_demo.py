"""Restaura o main.py original do template Gaudencio (para o container voltar a
subir e aceitarmos copies). O nosso app entra depois via shim."""
import time

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="Backend FastAPI Demo", version="1.0.0")


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    return HTMLResponse(content="<!DOCTYPE html><html><body>demo</body></html>")


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": app.title, "version": app.version, "time": time.time()}
