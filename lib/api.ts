/**
 * Cliente da API FastAPI (backend/). Tipos gerados do OpenAPI em lib/api-types.ts
 * (regenerar: curl http://127.0.0.1:8100/openapi.json -o lib/openapi.json &&
 *  npx openapi-typescript lib/openapi.json -o lib/api-types.ts).
 *
 * NEXT_PUBLIC_API_URL aponta para o backend (dev: http://127.0.0.1:8100;
 * cloud: https://app-d76b73421919.factorai.cloud).
 */
import type { components } from './api-types';
import type { LandingPage } from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8100').replace(/\/+$/, '');

export type ApiHealth = { ok: boolean; llm: boolean; pexels: boolean };
export type ApiPublishedRow = { slug: string; name: string; visits: number; leads: number; publishedAt: string; pageId?: string };

/** Plano do agente — espelha app/models.py::PlanOut (backend). */
export interface ApiPlanOut {
  source: string;
  name: string;
  objective: string;
  audience: string;
  offer: string;
  cta: string;
  brandColors: string[];
  visualDirection: string;
  visualQueries: string[];
  brandSummary?: string | null;
  productSummary?: string | null;
  theme?: Record<string, unknown> | null;
  questions: Array<{ key: string; question: string; why: string; placeholder: string }>;
  sections: Array<{ id: string; type: string; title: string; style: Record<string, unknown>; elements: Array<{ id: string; type: string; content: Record<string, unknown> }> }>;
}
export type ApiSection = components['schemas']['Section'] & { elements: Array<{ id: string; type: string; content: Record<string, unknown> }> };
export type ApiImageOut = { url: string; alt: string; source: string };
export type ApiLead = { _slug: string; _createdAt: string; sectionId?: string; elementId?: string; values?: Record<string, string> };

/** Ação de chat decidida pelo agente (/agent/intent). */
export interface ApiIntent {
  kind: 'rewrite' | 'image' | 'section' | 'remove_section' | 'move_section' | 'add_field' | 'recreate' | 'change_background' | 'style' | 'ask';
  section_type: string | null;
  text: string | null;
  position: 'top' | 'bottom' | null;
  reply: string;
  /** Passos 2..N de um pedido com várias coisas («muda o título E mete telefone»). */
  actions?: ApiIntent[];
}

/** Entrevista do agente antes de criar (/agent/interview). */
export interface ApiInterview {
  summary: string;
  questions: Array<{ key: string; question: string; why: string; needs: 'text' | 'photo' }>;
}

/** Sessão: token JWT guardado no browser; envia-se em todos os pedidos privados. */
export const tokenStore = {
  get: (): string | null => (typeof window === 'undefined' ? null : window.localStorage.getItem('la_token')),
  set: (t: string) => { try { window.localStorage.setItem('la_token', t); } catch { /* modo privado */ } },
  clear: () => { try { window.localStorage.removeItem('la_token'); } catch { /* noop */ } },
};

export type ApiUser = { id: string; email: string; name: string; role: string };

/** 422 da FastAPI: detail é uma LISTA de erros por campo — traduzir para legenda legível. */
export function detailMsg(data: Record<string, unknown>, status: number): string {
  const d = data.detail ?? data.error;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) {
    const msgs = (d as Array<Record<string, unknown>>).map((e) => `${(e.loc as string[] | undefined)?.slice(1).join('.') ?? '?'} — ${String(e.msg ?? '')}`);
    if (msgs.some((m) => /at most 20000 characters/i.test(m))) {
      return 'O texto é demasiado longo (máximo 20 000 caracteres). Encurta o briefing e tenta outra vez.';
    }
    return `O pedido não passou na validação: ${msgs.join('; ')}`;
  }
  return `API respondeu ${status}.`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(detailMsg(data, res.status));
  return data as T;
}

const post = <T,>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) });

/** Redimensiona no browser (máx 1600px, JPEG) — uploads leves e rápidos. */
export async function shrinkImage(file: File, maxPx = 1600, quality = 0.86): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size <= 900_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return out ?? file;
  } catch {
    return file; // browser sem createImageBitmap → envia cru, o servidor valida
  }
}

export const api = {
  health: () => req<ApiHealth>('/healthz'),

  /** Uma proposta (o /create chama em fila para 3 propostas).
   *  Vai pelo SSE /agent/plan/stream: o primeiro byte sai já e o edge da cloud
   *  não corta a ligação enquanto o modelo trabalha (o POST normal dava 504). */
  plan: async (briefing: Record<string, unknown>): Promise<ApiPlanOut> => {
    const token = tokenStore.get();
    const res = await fetch(`${API_URL}/agent/plan/stream?variants=1`, {
      method: 'POST', signal: AbortSignal.timeout(300_000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(briefing),
    });
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const d = data.detail ?? data.error;
      const detail = typeof d === 'string'
        ? d
        : Array.isArray(d) && d.length
          ? `O pedido não passou na validação: ${(d as Array<Record<string, unknown>>).map((e) => `${(e.loc as string[] | undefined)?.slice(1).join('.') ?? '?'} — ${String(e.msg ?? '')}`).join('; ')}`
          : `API respondeu ${res.status}.`;
      throw new Error(detail);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 2);
        if (!chunk.startsWith('data:')) continue;
        const ev = JSON.parse(chunk.slice(5)) as { event: string; ok?: boolean; plan?: ApiPlanOut; error?: string };
        if (ev.event === 'plan') {
          if (!ev.ok || !ev.plan) throw new Error(ev.error ?? 'A IA não devolveu proposta.');
          return ev.plan;
        }
      }
    }
    throw new Error('A IA não devolveu proposta.');
  },

  theme: (body: { instruction: string; context?: string | null; current?: unknown }) =>
    req<{ theme: Record<string, unknown> }>('/agent/theme', { method: 'POST', body: JSON.stringify(body) }),
  rewrite: (body: Record<string, unknown>) => req<{ text: string }>('/agent/rewrite', { method: 'POST', body: JSON.stringify(body) }),
  section: (body: Record<string, unknown>) => req<{ section: ApiSection }>('/agent/section', { method: 'POST', body: JSON.stringify(body) }),
  image: (body: Record<string, unknown>) => req<ApiImageOut>('/agent/image', { method: 'POST', body: JSON.stringify(body) }),
  intent: (body: { instruction: string; selection?: string | null; context?: string | null; history?: Array<{ role: string; text: string }>; sections: Array<{ type: string; title: string; excerpt?: string }> }) => req<ApiIntent>('/agent/intent', { method: 'POST', body: JSON.stringify(body) }),
  imagesSearch: (q: string) => req<{ source: string; photos: Array<{ url: string; alt: string }> }>(`/images/search?q=${encodeURIComponent(q)}`),
  /** O agente pergunta antes de criar (resumo + o que não pode inventar). */
  interview: (briefing: Record<string, unknown>) => req<ApiInterview>('/agent/interview', { method: 'POST', body: JSON.stringify(briefing) }),
  /** Foto do cliente → URL absoluta no servidor (bytes crus; o browser já redimensionou). */
  uploadPhoto: async (file: File): Promise<{ ok: boolean; url: string }> => {
    const blob = await shrinkImage(file);
    const token = tokenStore.get();
    const res = await fetch(`${API_URL}/upload`, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: blob });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Falha ao enviar a foto.');
    return data as { ok: boolean; url: string };
  },
  /** Documento do cliente (PDF/TXT/CSV) → URL para o agente linkar na página. */
  uploadDoc: async (file: File): Promise<{ ok: boolean; url: string }> => {
    if (file.size > 8_000_000) throw new Error('Ficheiro demasiado grande (máx 8MB).');
    const token = tokenStore.get();
    const res = await fetch(`${API_URL}/upload-doc`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: file });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Falha ao enviar o ficheiro.');
    return data as { ok: boolean; url: string };
  },

  /* conta */
  register: (body: { email: string; password: string; name?: string }) => post<{ ok: boolean; token: string; user: ApiUser }>('/auth/register', body),
  login: (body: { email: string; password: string }) => post<{ ok: boolean; token: string; user: ApiUser }>('/auth/login', body),
  me: () => req<{ user: ApiUser }>('/auth/me'),
  /** Troca a palavra-passe da sessão ativa (o servidor exige a atual). */
  changePassword: (body: { oldPassword: string; newPassword: string }) =>
    post<{ ok: boolean }>('/auth/change-password', body),

  /** Studio: o agente desenha uma página de HTML livre (SSE com heartbeat do backend). */
  designStream: async (
    briefing: Record<string, unknown>,
    seed: number,
    onEvent: (ev: Record<string, unknown>) => void,
  ): Promise<void> => {
    const token = tokenStore.get();
    const auth = { Authorization: `Bearer ${token}` } as Record<string, string>;
    // Trabalho em fundo + poll curto: ligações compridas morrem nos proxies da
    // cloud («network error»); pedidos de 2ms nunca morrem.
    const res = await fetch(`${API_URL}/agent/design?seed=${seed}`, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', ...(token ? auth : {}) },
      body: JSON.stringify(briefing),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error(detailMsg(data, res.status));
    }
    const { job } = (await res.json()) as { job: string };
    const started = Date.now();
    while (Date.now() - started < 540_000) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = await fetch(`${API_URL}/agent/design/${encodeURIComponent(job)}`, {
        signal: AbortSignal.timeout(20_000), headers: token ? auth : {},
      });
      if (st.status === 404) throw new Error('O servidor reiniciou a meio — tenta de novo.');
      if (!st.ok) continue; // nuvem ocupada: pergunta outra vez
      const d = (await st.json()) as Record<string, unknown>;
      if (!d.done) continue;
      if (d.ok === false) throw new Error(typeof d.error === 'string' ? d.error : 'O Studio não conseguiu criar a página.');
      onEvent({ event: 'design', ok: true, html: d.html, phone: d.phone });
      return;
    }
    throw new Error('A IA demorou demasiado — tenta outra vez (às vezes a nuvem está congestionada).');
  },
  /** Estúdio: o assistente edita a página (SSE com heartbeat — o free tier pensa
   *  mais de 100s e o proxy corta POSTs silenciosos com Failed to fetch). */
    /** Estúdio: o assistente edita a página como trabalho em fundo — o POST
   *  devolve um id já e perguntamos o estado de 4 em 4s. Ligações curtas: os
   *  proxies da cloud cortavam as compridas e o browser via «network error». */
  designEdit: async (html: string, instruction: string, briefing: string, onStage?: (s: string) => void): Promise<{ ok: boolean; html: string; phone?: string; ask?: string; summary?: string }> => {
    const token = tokenStore.get();
    const auth = { Authorization: `Bearer ${token}` } as Record<string, string>;
    const started = Date.now();
    const res = await fetch(`${API_URL}/agent/design/edit`, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', ...(token ? auth : {}) },
      body: JSON.stringify({ html, instruction, briefing }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error(detailMsg(data, res.status));
    }
    const { job } = (await res.json()) as { job: string };
    // até 9 min de espera ativa — o free tier pode pensar muito em páginas grandes
    while (Date.now() - started < 540_000) {
      await new Promise((r) => setTimeout(r, 4000));
      const st = await fetch(`${API_URL}/agent/design/edit/${encodeURIComponent(job)}`, {
        signal: AbortSignal.timeout(20_000), headers: token ? auth : {},
      });
      if (st.status === 404) throw new Error('O servidor reiniciou a meio — tenta de novo.');
      if (!st.ok) continue; // nuvem ocupada: pergunta outra vez
      const d = (await st.json()) as Record<string, unknown>;
      if (!d.done) { if (d.stage && onStage) onStage(String(d.stage)); continue; }
      if (d.ok === false) throw new Error(typeof d.error === 'string' ? d.error : 'O assistente não conseguiu editar a página.');
      if (typeof d.ask === 'string' && d.ask) return { ok: true, html: '', ask: d.ask };
      return { ok: true, html: String(d.html), phone: d.phone ? String(d.phone) : undefined, summary: typeof d.summary === 'string' ? d.summary : undefined };
    }
    throw new Error('A IA demorou demasiado — tenta outra vez (às vezes a nuvem está congestionada).');
  },
  pagesList: () => req<{ pages: LandingPage[] }>('/pages'),
  pageSave: (page: LandingPage) => post<{ ok: boolean; id: string }>('/pages', page),
  pageGet: (id: string) => req<{ page: LandingPage }>(`/pages/${encodeURIComponent(id)}`),
  pageDelete: (id: string) => req<{ ok: boolean }>(`/pages/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  publish: (slug: string, page: LandingPage) => post<{ ok: boolean; slug: string; url: string }>('/publish', { slug, page }),
  unpublish: (slug: string) => post<{ ok: boolean }>('/unpublish', { slug }),
  publishedList: () => req<{ pages: ApiPublishedRow[] }>('/published'),
  publishedGet: (slug: string) => req<{ slug: string; name: string; visits: number; page: LandingPage }>(`/published/${encodeURIComponent(slug)}`),
  visit: (slug: string) => post<{ ok: boolean; visits: number }>('/visit', { slug }),

  leadAdd: (body: { slug: string; sectionId: string; elementId: string; values: Record<string, string> }) => post<{ ok: boolean; message: string }>('/leads', body),
  leadsList: (slug?: string) => req<{ leads: ApiLead[] }>(slug ? `/leads?slug=${encodeURIComponent(slug)}` : '/leads'),

  /* Analytics reais do servidor: visitas às páginas publicadas + leads por página */
  analytics: () => req<{ ok: boolean; visits: number; leads: number; conversion: number; published: number; rows: Array<{ slug: string; name: string; visits: number; leads: number }> }>('/account/analytics'),

  /* API do CRM — chaves (hash na BD, cru mostrado uma vez) + webhook por página */
  apiKeysList: () => req<{ keys: Array<{ id: string; label: string; prefix: string; created_at: string }> }>('/account/api-keys'),
  apiKeyCreate: (label: string) => post<{ key: { id: string; label: string; prefix: string; created_at: string }; token: string }>('/account/api-keys', { label }),
  apiKeyDelete: (id: string) => req<{ ok: boolean }>(`/account/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  webhooksList: () => req<{ webhooks: Array<{ slug: string; url: string; createdAt: string }> }>('/account/webhooks'),
  webhookSet: (slug: string, url: string) => post<{ ok: boolean; slug: string; url: string; secret: string }>('/account/webhooks', { slug, url }),
  webhookDelete: (slug: string) => req<{ ok: boolean }>(`/account/webhooks/${encodeURIComponent(slug)}`, { method: 'DELETE' }),

  /* Redes sociais — tokens do dono (validados na plataforma ao ligar) + publicação direta */
  socialStatus: () => req<{ platforms: Record<string, { connected: boolean; label: string }> }>('/account/social'),
  socialConnect: (platform: string, token: string, igUserId?: string) =>
    post<{ ok: boolean; platform: string; label: string }>('/account/social', { platform, token, ig_user_id: igUserId }),
  socialDisconnect: (platform: string) => req<{ ok: boolean }>(`/account/social/${encodeURIComponent(platform)}`, { method: 'DELETE' }),
  socialPublish: (slug: string, url: string, platforms?: string[]) =>
    post<{ ok: boolean; results: Array<{ platform: string; ok: boolean; detail: string }> }>('/account/social/publish', { slug, url, platforms }),
};
