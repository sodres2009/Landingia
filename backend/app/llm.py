"""Cliente LLM — OpenAI-compatible (FactorRouter / Groq) com saída validada.

Duas camadas:
  chat()      → texto, com cadeia de modelos (fallback de 429/5xx por modelo)
  ask_json()  → JSON validado contra um modelo Pydantic; se o modelo devolve
                JSON inválido, re-pedimos uma vez explicando o erro.
                (é o "instructor-lite": substitui extractJson/reparação do JS)

FactorRouter: todos os pedidos a /v1/* exigem os 9 headers X-* (ausente = 400).
Enviamo-los sempre — em provedores que não os conhecem (Groq) são ignorados.
"""
import contextvars
import json
import re
import uuid
from typing import Optional, Type, TypeVar
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError

from . import config

ModelT = TypeVar("ModelT", bound=BaseModel)

# Utilizador do request atual (Fase 2 preenche a partir do JWT; até lá tudo "null").
current_user: contextvars.ContextVar[dict] = contextvars.ContextVar("llm_user", default={})


def _router_headers(user_message: str, session: str) -> dict:
    """Os 9 X-* do FactorRouter. Headers HTTP são latin-1: nomes/messages levam percent-encode."""
    u = current_user.get() or {}
    return {
        "X-App-Id": config.FACTOR_APP_ID,
        "X-Turn-Id": str(uuid.uuid4()),  # uuid4 novo por chamada, como pede o gateway
        "X-Session-Id": session or "general",
        "X-Conversation-Id": "null",
        "X-User-Message": quote((user_message or "").strip()[:500]),
        "X-User-Id": str(u.get("id") or "null"),
        "X-User-Name": quote(str(u.get("name") or "null")),
        "X-User-Email": quote(str(u.get("email") or "null")),
        "X-Company-Id": str(u.get("company_id") or "null"),
        "X-Company-Name": quote(str(u.get("company_name") or "null")),
    }


async def chat(system: str, user: str, model: Optional[str] = None, temperature: float = 0.8,
               max_tokens: Optional[int] = None, session: str = "general", timeout: Optional[float] = None,
               stream: bool = False) -> str:
    headers = {"Content-Type": "application/json", **_router_headers(user, session)}
    if config.AI_API_KEY:
        headers["Authorization"] = f"Bearer {config.AI_API_KEY}"
    models = [model] if model else config.AI_MODELS
    last_error: Exception = RuntimeError("Nenhum modelo configurado.")
    import asyncio

    # Cadeia: provedor principal → fallback (Groq) se configurado. O FactorRouter é
    # novo e instável; as propostas nunca podem morrer com ele.
    chain: list[tuple[str, str, str]] = [(config.AI_BASE_URL, config.AI_API_KEY, m) for m in models]
    if config.FALLBACK_API_KEY and config.FALLBACK_BASE_URL:
        chain += [(config.FALLBACK_BASE_URL, config.FALLBACK_API_KEY, m) for m in config.FALLBACK_MODELS]

    # 60s por tentativa: o edge da plataforma corta pedidos acima de ~100s; uma
    # tentativa longa a mais mata o pedido inteiro antes de o fallback chegar lá.
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout or config.AI_TIMEOUT, connect=15.0)) as client:
        for base_url, api_key, m in chain:
            req_headers = dict(headers)
            if api_key:
                req_headers["Authorization"] = f"Bearer {api_key}"
            else:
                req_headers.pop("Authorization", None)
            for attempt, backoff in enumerate((0, 2.5, 5.0)):  # espera e tenta o mesmo modelo antes de trocar
                if backoff:
                    await asyncio.sleep(backoff)
                body: dict = {
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "max_tokens": max_tokens or config.AI_MAX_TOKENS,
                    "temperature": temperature,
                }
                if m:
                    body["model"] = m
                # Modelos de raciocínio no router gastam o budget todo em "reasoning"
                # e devolvem content null / horas de latência (visto 24-09). Nos
                # nossos prompts estruturados pensar alto não paga — desliga-se.
                if "factorai" in base_url or attempt:
                    body["enable_thinking"] = False
                if stream:
                    body["stream"] = True
                try:
                    if stream:
                        # SSE dentro do servidor: bytes a fluir >100s não apanham
                        # o 524 do Cloudflare (pedidos non-stream longos morrem lá).
                        async with client.stream("POST", f"{base_url}/chat/completions", headers=req_headers, json=body) as res:
                            if res.status_code != 200:
                                await res.aread()
                                detail = ""
                                try:
                                    detail = res.json().get("error", {}).get("message", "")
                                except Exception:
                                    pass
                                raise RuntimeError(f"AI provider respondeu {res.status_code}{' — ' + detail if detail else ''}.")
                            parts: list[str] = []
                            async for line in res.aiter_lines():
                                if not line.startswith("data:"):
                                    continue
                                payload = line[5:].strip()
                                if payload == "[DONE]":
                                    break
                                try:
                                    delta = json.loads(payload).get("choices", [{}])[0].get("delta", {}).get("content")
                                except Exception:
                                    continue
                                if isinstance(delta, str):
                                    parts.append(delta)
                        content = "".join(parts)
                    else:
                        res = await client.post(f"{base_url}/chat/completions", headers=req_headers, json=body)
                        if res.status_code != 200:
                            detail = ""
                            try:
                                detail = res.json().get("error", {}).get("message", "")
                            except Exception:
                                pass
                            raise RuntimeError(f"AI provider respondeu {res.status_code}{' — ' + detail if detail else ''}.")
                        data = res.json()
                        content = data.get("choices", [{}])[0].get("message", {}).get("content")
                    if not isinstance(content, str) or not content.strip():
                        raise RuntimeError("AI provider devolveu resposta vazia.")
                    return content
                except Exception as exc:  # retry no mesmo modelo; depois o próximo da cadeia
                    last_error = exc if isinstance(exc, Exception) else last_error
    raise last_error


def _extract_json(text: str) -> dict:
    """Rede de segurança mínima: alguns modelos embrulham o JSON em ```json.
    A validação séria é do Pydantic — aqui só tiramos o invólucro markdown."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


async def ask_json(system: str, user: str, schema: Type[ModelT], retries: int = 2,
                   max_tokens: Optional[int] = None, session: str = "general") -> ModelT:
    """Pede JSON ao modelo e valida contra o schema. Re-pede com feedback do erro."""
    prompt_user = user + "\n\nDevolve APENAS um objeto JSON válido que cumpra exatamente este contrato. Sem markdown, sem comentários."
    last_error: Exception = RuntimeError("AI indisponível.")
    for attempt in range(retries + 1):
        try:
            raw = await chat(system, prompt_user, max_tokens=max_tokens, session=session)
            data = _extract_json(raw)
        except json.JSONDecodeError as exc:
            last_error = exc
            prompt_user = user + f"\n\nA tua resposta anterior não era JSON válido ({exc}). Devolve AGORA apenas JSON válido."
            continue
        except Exception as exc:
            last_error = exc
            continue
        try:
            return schema.model_validate(data)
        except ValidationError as exc:
            last_error = exc
            short = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:6])
            prompt_user = user + f"\n\nO JSON anterior falhou validação: {short}. Corrige e devolve APENAS o JSON corrigido."
    raise last_error


def llm_available() -> bool:
    return bool(config.AI_BASE_URL and config.AI_API_KEY)
