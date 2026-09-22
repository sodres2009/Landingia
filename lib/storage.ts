import type {
  AiContext,
  AiPlan,
  Booking,
  BuilderElement,
  BuilderSection,
  LandingPage,
  Lead,
  SocialLink,
  Status,
} from './types';

/**
 * Persistência em localStorage.
 * Usa as mesmas chaves do v2 (`landing-ai-*`) para que páginas, leads e
 * bookings já criados sobrevivam à migração para a v3.
 */
const KEYS = {
  pages: 'landing-ai-pages',
  leads: 'landing-ai-leads',
  bookings: 'landing-ai-bookings',
  settings: 'landing-ai-settings',
} as const;

/** Identificador único (com fallback para ambientes sem crypto.randomUUID). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
}

/* ─────────────────────────── Normalização / migração ─────────────────────────── */

const VALID_ELEMENT_TYPES = new Set([
  'text', 'list', 'image', 'video', 'button', 'form', 'scheduling', 'modal',
  'testimonials', 'faq', 'pricing', 'gallery', 'map', 'social', 'stats', 'marquee', 'custom',
]);

/** Garante que um registo de storage malformado nunca rebenta com o editor. */
function normalizeElement(raw: unknown): BuilderElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const type = String(e.type ?? 'text');
  if (!VALID_ELEMENT_TYPES.has(type)) return null;
  const content = e.content && typeof e.content === 'object' ? (e.content as Record<string, unknown>) : { text: '' };
  return { id: String(e.id || uid()), type: type as BuilderElement['type'], content, style: (e.style as BuilderElement['style']) ?? undefined };
}

function normalizeSection(raw: unknown): BuilderSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const elements = Array.isArray(s.elements)
    ? (s.elements.map(normalizeElement).filter(Boolean) as BuilderElement[])
    : [];
  if (!elements.length) return null;
  return {
    id: String(s.id || uid()),
    type: String(s.type || 'custom'),
    title: String(s.title || 'Secção'),
    elements,
    hidden: Boolean(s.hidden),
    style: (s.style as BuilderSection['style']) ?? undefined,
  };
}

function normalizePage(raw: unknown): LandingPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (!p.id) return null;
  const status: Status = p.status === 'published' || p.status === 'paused' ? p.status : 'draft';
  const sections = Array.isArray(p.sections)
    ? (p.sections.map(normalizeSection).filter(Boolean) as BuilderSection[])
    : [];
  const created = typeof p.createdAt === 'string' ? p.createdAt : now();
  return {
    id: String(p.id),
    name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Sem nome',
    status,
    createdAt: created,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : created,
    objective: typeof p.objective === 'string' ? p.objective : undefined,
    style: typeof p.style === 'string' ? p.style : undefined,
    logo: p.logo && typeof p.logo === 'object' ? (p.logo as LandingPage['logo']) : undefined,
    socialLinks: Array.isArray(p.socialLinks) ? (p.socialLinks as SocialLink[]) : undefined,
    aiContext: p.aiContext && typeof p.aiContext === 'object' ? (p.aiContext as AiContext) : undefined,
    sections: sections.length ? sections : [seedHeroSection()],
    visits: typeof p.visits === 'number' ? p.visits : 0,
    leads: typeof p.leads === 'number' ? p.leads : 0,
  };
}

/* ─────────────────────────── Páginas ─────────────────────────── */

function seedHeroSection(): BuilderSection {
  return {
    id: uid(),
    type: 'hero',
    title: 'Hero',
    elements: [
      { id: uid(), type: 'text', content: { text: 'Transforme visitantes em clientes.', level: 'heading' } },
      { id: uid(), type: 'text', content: { text: 'Uma Landing Page criada para apresentar a sua oferta e captar oportunidades.', level: 'body' } },
      { id: uid(), type: 'button', content: { label: 'Pedir orçamento', url: '#form', variant: 'primary' } },
    ],
  };
}

/** Página inicial mínima usada por `createPage` e como rede de segurança. */
export function seedPage(): LandingPage {
  const timestamp = now();
  return {
    id: uid(),
    name: 'Nova Landing Page',
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
    objective: 'Captar leads',
    style: 'Moderno',
    visits: 0,
    leads: 0,
    sections: [
      seedHeroSection(),
      {
        id: uid(),
        type: 'benefits',
        title: 'Benefícios',
        elements: [
          { id: uid(), type: 'text', content: { text: 'Confiança, clareza e conversão.', level: 'heading' } },
          { id: uid(), type: 'text', content: { text: 'Explique os principais benefícios da sua solução.', level: 'body' } },
        ],
      },
      {
        id: uid(),
        type: 'form',
        title: 'Contacto',
        elements: [
          {
            id: uid(),
            type: 'form',
            content: {
              title: 'Fale connosco',
              fields: [
                { id: uid(), label: 'Nome', type: 'text', required: true },
                { id: uid(), label: 'Email', type: 'email', required: true },
                { id: uid(), label: 'Telefone', type: 'tel', required: false },
                { id: uid(), label: 'Mensagem', type: 'textarea', required: false },
              ],
              submit: 'Enviar pedido',
              success: 'Obrigado! Entraremos em contacto brevemente.',
              consent: true,
            },
          },
        ],
      },
    ],
  };
}

export function getPages(): LandingPage[] {
  const raw = readJson<unknown[]>(KEYS.pages, []);
  return (raw.map(normalizePage).filter(Boolean) as LandingPage[]);
}

export function savePages(pages: LandingPage[]): void {
  writeJson(KEYS.pages, pages);
}

export function getPage(id: string): LandingPage | null {
  return getPages().find((x) => x.id === id) ?? null;
}

export function savePage(page: LandingPage): LandingPage {
  const pages = getPages();
  const saved = { ...page, updatedAt: now() };
  const index = pages.findIndex((x) => x.id === page.id);
  if (index >= 0) pages[index] = saved;
  else pages.push(saved);
  savePages(pages);
  return saved;
}

export function createPage(name = 'Nova Landing Page', objective = 'Captar leads', style = 'Moderno'): LandingPage {
  const page = seedPage();
  page.name = name;
  page.objective = objective;
  page.style = style;
  return savePage(page);
}

export function removePage(id: string): void {
  savePages(getPages().filter((x) => x.id !== id));
}

/** Converte o plano do motor de IA num objeto LandingPage (sem persistir). */
export function planToPage(input: {
  plan: AiPlan;
  style?: string;
  logo?: { url: string; alt?: string };
  answers?: Record<string, string>;
}): LandingPage {
  const base = seedPage();
  const sections = input.plan.sections
    .map((s) => normalizeSection({ ...s, id: s.id || uid() }))
    .filter(Boolean) as BuilderSection[];
  return {
    ...base,
    name: input.plan.name?.trim() || 'Landing Page criada com IA',
    objective: input.plan.objective || base.objective,
    style: input.style || base.style,
    logo: input.logo,
    aiContext: {
      brandSummary: input.plan.brandSummary,
      productSummary: input.plan.productSummary,
      audience: input.plan.audience,
      offer: input.plan.offer,
      cta: input.plan.cta,
      visualDirection: input.plan.visualDirection,
      brandColors: input.plan.brandColors,
      visualQueries: input.plan.visualQueries,
      answers: input.answers,
    },
    sections: sections.length ? sections : base.sections,
  };
}

/** Cria e guarda a página a partir do plano devolvido pelo motor de IA. */
export function createPageFromPlan(input: {
  plan: AiPlan;
  style?: string;
  logo?: { url: string; alt?: string };
  answers?: Record<string, string>;
}): LandingPage {
  return savePage(planToPage(input));
}

/* ─────────────────────────── Leads & Bookings ─────────────────────────── */

export function getLeads(): Lead[] {
  return readJson<Lead[]>(KEYS.leads, []);
}

export function saveLeads(leads: Lead[]): void {
  writeJson(KEYS.leads, leads);
}

export function addLead(lead: Omit<Lead, 'id' | 'createdAt' | 'status'>): Lead {
  const created: Lead = { ...lead, id: uid(), createdAt: now(), status: 'Novo' };
  saveLeads([created, ...getLeads()]);
  if (lead.pageId) {
    const page = getPage(lead.pageId);
    if (page) savePage({ ...page, leads: (page.leads ?? 0) + 1 });
  }
  return created;
}

export function updateLead(id: string, patch: Partial<Lead>): void {
  saveLeads(getLeads().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function getBookings(): Booking[] {
  return readJson<Booking[]>(KEYS.bookings, []);
}

export function addBooking(booking: Omit<Booking, 'id' | 'createdAt'>): Booking {
  const created: Booking = { ...booking, id: uid(), createdAt: now() };
  writeJson(KEYS.bookings, [created, ...getBookings()]);
  return created;
}

/* ─────────────────────────── Definições ─────────────────────────── */

export interface Settings {
  company: string;
  brand: string;
  language: string;
  theme: string;
}

export function getSettings(): Settings {
  return readJson<Settings>(KEYS.settings, {
    company: 'Minha Empresa',
    brand: 'Landing AI',
    language: 'pt-PT',
    theme: 'dark',
  });
}

export function saveSettings(settings: Settings): void {
  writeJson(KEYS.settings, settings);
}
