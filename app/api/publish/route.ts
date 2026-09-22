import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Páginas publicadas vivem no disco do servidor (não no browser),
 * para que a URL pública funcione em qualquer dispositivo.
 * Em produção usa PUBLISHED_DIR (ex.: /data/published) para sobreviver a deploys.
 */
const DIR = process.env.PUBLISHED_DIR ?? path.join(process.cwd(), '.published');
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const MAX_BYTES = 400_000;

function pageFile(slug: string) { return path.join(DIR, `${slug}.json`); }
function leadFile(slug: string) { return path.join(DIR, `${slug}.leads.jsonl`); }

async function readPage(slug: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(pageFile(slug), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function countLeads(slug: string): Promise<number> {
  try {
    const raw = await fs.readFile(leadFile(slug), 'utf8');
    return raw.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

/** Sem slug: lista tudo o que está publicado (o dashboard precisa de ver os dados dos visitantes reais). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';

  if (!slug) {
    await fs.mkdir(DIR, { recursive: true });
    const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
    const pages = [];
    for (const f of files) {
      const s = f.replace(/\.json$/, '');
      const stored = await readPage(s);
      if (!stored) continue;
      const p = (stored.page ?? {}) as { name?: string; visits?: number };
      pages.push({ slug: s, name: p.name ?? s, visits: p.visits ?? 0, leads: await countLeads(s), publishedAt: stored.publishedAt });
    }
    return NextResponse.json({ pages });
  }

  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
  const page = await readPage(slug);
  if (!page) return NextResponse.json({ error: 'Página não publicada.' }, { status: 404 });

  // ?slug=X&mode=leads: devolve os leads gravados no servidor para essa página.
  if (url.searchParams.get('mode') === 'leads') {
    let leads: unknown[] = [];
    try {
      const raw = await fs.readFile(leadFile(slug), 'utf8');
      leads = raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown);
    } catch { /* ainda sem leads */ }
    const p = (page.page ?? {}) as { name?: string };
    return NextResponse.json({ leads, pageName: p.name ?? slug });
  }

  return NextResponse.json({ page });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Pedido sem JSON válido.' }, { status: 400 });
  }
  const action = String(body.action ?? 'publish');

  // Lead de um formulário publicado: guarda em JSONL no servidor.
  if (action === 'lead') {
    const slug = String(body.slug ?? '');
    if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    const stored = await readPage(slug);
    if (!stored) return NextResponse.json({ error: 'Página não publicada.' }, { status: 404 });
    const values = (body.values ?? {}) as Record<string, string>;
    await fs.appendFile(leadFile(slug), JSON.stringify({ ts: new Date().toISOString(), sectionId: body.sectionId, elementId: body.elementId, values }) + '\n');
    // Mensagem de sucesso vem do próprio formulário publicado.
    const section = ((stored.page as { sections?: Array<{ id: string; elements: Array<{ id: string; type: string; content: Record<string, unknown> }> }> })?.sections ?? [])
      .find((s) => s.id === body.sectionId);
    const element = section?.elements.find((e) => e.id === body.elementId);
    const message = String(element?.content?.success ?? 'Obrigado! Entraremos em contacto.');
    return NextResponse.json({ ok: true, message });
  }

  // Visita de um visitante real à URL pública: incrementa o contador no ficheiro publicado.
  if (action === 'visit') {
    const visitSlug = String(body.slug ?? '');
    if (!SLUG_RE.test(visitSlug)) return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    const stored = await readPage(visitSlug);
    if (!stored) return NextResponse.json({ error: 'Página não publicada.' }, { status: 404 });
    const inner = (stored.page ?? {}) as { visits?: number };
    inner.visits = (inner.visits ?? 0) + 1;
    await fs.writeFile(pageFile(visitSlug), JSON.stringify({ ...stored, page: inner }));
    return NextResponse.json({ ok: true, visits: inner.visits });
  }

  const slug = String(body.slug ?? '');
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });

  if (action === 'unpublish') {
    await fs.rm(pageFile(slug), { force: true });
    await fs.rm(leadFile(slug), { force: true });
    return NextResponse.json({ ok: true });
  }

  // publish: substitui a versão publicada (upsert pelo mesmo slug).
  const raw = JSON.stringify(body.page ?? null);
  if (!raw || raw === 'null' || raw.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Página ausente ou demasiado grande para publicar.' }, { status: 400 });
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(pageFile(slug), JSON.stringify({ page: JSON.parse(raw), publishedAt: new Date().toISOString() }));
  return NextResponse.json({ ok: true, slug, url: `/p/${slug}` });
}
