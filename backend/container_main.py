"""Ponto de entrada do template Gaudencio (uvicorn main:app).

Reencaminha para o nosso FastAPI real em app.main — assim o gestor do
container mantém o ciclo de vida e nós servimos a API do gerador.
"""
import os
import sys

# uvicorn pode arrancar fora de /app — garantir que o pacote `app` é encontrável.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app  # noqa: E402,F401

__all__ = ["app"]
