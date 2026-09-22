/**
 * Pesquisa real do agente na Internet, no servidor, sem chaves de API.
 * Fontes: Wikipédia PT (REST + busca) e DuckDuckGo Instant Answers.
 * Usada para fundamentar os textos da página com factos do mundo real sobre
 * o assunto do briefing. Nunca rebenta o fluxo: timeout curto e `null` honesto.
 */

export interface ResearchNote {
  title: string;
  extract: string;
  source: string;
}

const HEADERS = { headers: { 'User-Agent': 'LandingAI-3.0/1.0 (gerador de landing pages; uso de pesquisa pontual)' } };
const TIMEOUT_MS = 4500;
const CACHE = new Map<string, { at: number; note: ResearchNote | null }>();

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ]);
}

/** Palavras mais informativas do briefing, sem ruído de "landing/quero/para". */
function topicOf(description: string): string {
  const STOP = new Set(['landing', 'pagina', 'page', 'quero', 'preciso', 'gostaria', 'para', 'com', 'uma', 'um', 'meu', 'minha', 'site', 'criar', 'vender', 'negocio', 'empresa', 'cliente', 'pessoas', 'desta', 'coisas', 'tipo', 'online', 'internet']);
  const words = description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return words.slice(0, 4).join(' ');
}

async function wikipedia(query: string): Promise<ResearchNote | null> {
  const slug = encodeURIComponent(query);
  let res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${slug}`, HEADERS);
  if (!res.ok) {
    const searchUrl = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${slug}&srlimit=1&format=json&origin=*`;
    const search = await fetch(searchUrl, HEADERS);
    if (!search.ok) return null;
    const found = (await search.json()) as { query?: { search?: Array<{ title?: string }> } };
    const title = found.query?.search?.[0]?.title;
    if (!title) return null;
    res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, HEADERS);
  }
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  if (!j.extract || j.extract.length < 40) return null;
  return { title: j.title ?? query, extract: j.extract, source: j.content_urls?.desktop?.page ?? `https://pt.wikipedia.org/wiki/${encodeURIComponent(j.title ?? query)}` };
}

async function duckduckGo(query: string): Promise<ResearchNote | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, HEADERS);
  if (!res.ok) return null;
  const j = (await res.json()) as { AbstractText?: string; AbstractURL?: string; Heading?: string; Definition?: string; DefinitionURL?: string };
  const extract = j.AbstractText || j.Definition;
  if (!extract || extract.length < 40) return null;
  return { title: j.Heading || query, extract, source: j.AbstractURL || j.DefinitionURL || 'https://duckduckgo.com' };
}

/** Pesquisa o assunto do briefing; devolve null se nada fiável for encontrado. */
export async function researchSubject(description: string): Promise<ResearchNote | null> {
  const topic = topicOf(description);
  if (topic.length < 2) return null;
  const cached = CACHE.get(topic);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.note;

  let note: ResearchNote | null = null;
  try {
    note = (await withTimeout(wikipedia(topic))) ?? (await withTimeout(duckduckGo(topic)));
  } catch {
    note = null;
  }
  CACHE.set(topic, { at: Date.now(), note });
  return note;
}
