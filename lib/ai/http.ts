import type { AiPlan } from '../types';
import { extractJson, localProvider } from './local';
import { pickImage, pickImageForRole, pickByTags } from './images';
import { researchSubject, type ResearchNote } from './research';
import type { AiProvider, AiSectionDraft, ImageChoice, ImageRequest, PlanBriefing, RewriteRequest, SectionRequest } from './types';

/**
 * Provider HTTP genérico para qualquer API de chat compatível com o formato
 * `{ messages:[{role,content}] } -> { choices:[{message:{content}}] }`
 * (OpenAI-compatible, vLLM, Ollama /v1, LM Studio, gateway próprio, etc.).
 * Nenhum fornecedor é hardcoded — tudo vem de variáveis de ambiente:
 *   AI_PROVIDER=http, AI_BASE_URL, AI_API_KEY (opcional), AI_MODEL (opcional).
 * Se a chamada falhar, cai no motor local em vez de rebentar com a app.
 */

function envConfig(): { baseUrl: string; apiKey: string; models: string[]; maxTokens: number } | null {
  const baseUrl = (process.env.AI_BASE_URL ?? '').trim();
  if (!baseUrl) return null;
  // AI_MODEL aceita lista separada por vírgulas: o agente tenta cada um
  // por ordem até um responder (o free tier do Groq limita os melhores).
  const models = (process.env.AI_MODEL ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: (process.env.AI_API_KEY ?? '').trim(),
    models: models.length ? models : [''],
    // Sem max_tokens alguns providers cortam a resposta a meio do JSON.
    maxTokens: Math.min(Math.max(Number(process.env.AI_MAX_TOKENS) || 4000, 800), 8000),
  };
}

async function chat(config: { baseUrl: string; apiKey: string; maxTokens: number }, model: string, system: string, user: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body: Record<string, unknown> = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: config.maxTokens,
    temperature: 0.8,
  };
  if (model) body.model = model;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      detail = errBody?.error?.message ? ` — ${errBody.error.message}` : '';
    } catch {
      // corpo de erro não-JSON
    }
    throw new Error(`AI provider respondeu ${res.status}${detail}.`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider devolveu resposta vazia.');
  return content;
}

/** Tenta a cadeia de modelos por ordem; só desiste quando todos falham. */
async function chatWithFallback(config: { baseUrl: string; apiKey: string; models: string[]; maxTokens: number }, system: string, user: string): Promise<string> {
  let lastError = new Error('Nenhum modelo configurado.');
  for (const model of config.models) {
    try {
      return await chat(config, model, system, user);
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
    }
  }
  throw lastError;
}

const SYSTEM_PROMPT = 'És um construtor de Landing Pages em português de Portugal. Devolves APENAS um objeto JSON válido e completo, sem comentários nem markdown. Dentro dos valores de texto nunca uses aspas duplas — usa «» no lugar. Nunca inventes factos, preços, datas ou testemunhos que não estejam no briefing.';

/** Os modelos gratuitos têm treino antigo e escrevem anos passados — a data real vai sempre no prompt. */
function dateRule(): string {
  const now = new Date();
  return `DATA DE HOJE: ${now.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric'})} (ano ${now.getFullYear()}). Se precisares de mencionar um ano, usa SEMPRE ${now.getFullYear()}; nunca escrevas anos anteriores a ${now.getFullYear()}.`;
}

const LAYOUT_SPEC = 'LAYOUT por secção (escolhe um, vai ficar bonito): hero → hero-split | hero-center | hero-fullbleed · benefícios/problema → benefits-grid | benefits-zigzag · prova social → proof-stats (usar elemento stats com items[{value,label}]) | testimonials-cards | logo-marquee (elemento marquee com items[string]) · formulário → form-split · CTA final → cta-band. No hero-split/center o PRIMEIRO text deve ser um eyebrow curto tipo «Nº1 em Coimbra» (6-8 palavras, sem aspas duplas). Para benefits-grid usa 3 elementos text curtos; para zigzag usa um list com 3-4 itens.';

const ELEMENT_SPEC = 'Elementos válidos (tipo → content exato): text → {text, level("heading"|"title"|"subtitle"|"body")} · list → {items:[{icon,text}]} · stats → {items:[{value,label}]} · marquee → {items:[string]} · button → {label, url, variant("primary"|"secondary")} · image → {url, alt} (url vazio se não houver imagem real) · form → {title, fields:[{label,type("text"|"email"|"tel"|"textarea"),required}], submit, success, consent} · testimonials → {items:[{name, role, text}]} · pricing → {plans:[{name, price, features[], cta}]} · faq → {items:[{q, a}]} · gallery → {images:[{url, alt}]}. Secção: {type,title,style:{background,accent,layout},elements:[{type,content}]}. Não inventes tipos nem nomes de campos.';

/** Regras de dimensão: respostas longas a mais ficam cortadas a meio do JSON. */
const SIZE_RULES = 'LIMITES PARA O JSON CABER NA RESPOSTA: 6 secções exatamente (hero, problema, benefícios, prova/social, faq, formulário+CTA), 1 a 3 elementos por secção, textos com no máximo 220 caracteres, 3 itens em listas, brandColors com 3 hex, visualQueries 2, questions no máximo 2. Fecha sempre todas as chavetas.';

const IMAGE_RULES = 'IMAGENS SÃO OBRIGATÓRIAS: inclui um elemento image no hero e em pelo menos 2 outras secções (3+ imagens no total). Deixa url vazio e escreve alt descritivo em português com o que a foto deve mostrar (ex.: «equipa de limpeza profissional num escritório moderno»).';

/**
 * Passe 1 da geração: estratégia de copy (pequena e cacheada por briefing).
 * Separar estratégia da escrita melhora muito a qualidade com modelos
 * gratuitos — o segundo passe recebe decisões concretas em vez de um vazio.
 */
interface Strategy {
  persona: string;
  angle: string;
  promise: string;
  objections: string[];
  proof: string;
}
const STRATEGY_CACHE = new Map<string, { at: number; s: Strategy }>();

async function strategyPass(config: Parameters<typeof chatWithFallback>[0], briefing: PlanBriefing, research?: ResearchNote | null): Promise<Strategy | null> {
  const key = `${briefing.description}|${briefing.objective}|${briefing.variantHint ?? ''}`.toLowerCase();
  const hit = STRATEGY_CACHE.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.s;
  const researchBlock = research ? `\nFACTO REAL: ${research.title} — ${research.extract}` : '';
  const user = `Seis linhas, uma por linha, sem markdown nem numeração:\nPERSONA: quem é o cliente ideal deste produto e o que o tira do sério\nÂNGULO: o corte retórico da página (ex.: dor-latente, medo-de-perder, prova-em-números, custo-da-inércia)\nPROMESSA: a única promessa concreta e mensurável\nOBJEÇÃO-1 + OBJEÇÃO-2: as duas razões para NÃO comprar\nPROVA: o tipo de prova social mais credível para este negócio\nBRIEFING: ${briefing.description}\nOBJETIVO: ${briefing.objective}${researchBlock}${briefing.variantHint ? `\nÂNGULO PEDIDO: ${briefing.variantHint}` : ''}`;
  try {
    const raw = await chatWithFallback(config, 'És estratega de copywriting de conversão em português de Portugal. Responde em 6 linhas simples, sem introduções.', user);
    const line = (p: string) => raw.split('\n').map((l) => l.trim()).find((l) => l.toUpperCase().startsWith(p))?.split(':').slice(1).join(':').trim() ?? '';
    const s: Strategy = {
      persona: line('PERSONA'),
      angle: line('ÂNGULO') || line('ANGULO'),
      promise: line('PROMESSA'),
      objections: [line('OBJEÇÃO-1') || line('OBJECAO-1'), line('OBJEÇÃO-2') || line('OBJECAO-2')].filter(Boolean),
      proof: line('PROVA'),
    };
    if (!s.persona || !s.promise) return null;
    STRATEGY_CACHE.set(key, { at: Date.now(), s });
    return s;
  } catch {
    return null;
  }
}

function strategyBlock(s: Strategy | null | undefined): string {
  if (!s) return '';
  return `\nESTRATÉGIA DECIDIDA (segue-a, não a reinventes):\n- Cliente: ${s.persona}\n- Ângulo: ${s.angle}\n- Promessa: ${s.promise}\n- Objeções a desarmar: ${s.objections.join(' · ')}\n- Prova: ${s.proof}`;
}

/** Exemplos de headlines fortes (few-shot) — a diferença entre copy morna e copy de agência. */
const FEWSHOT = 'EXEMPLOS DO NÍVEL DE HEADLINE QUERIDO (PT-PT, não copies o texto, copia a técnica: número + mecanismo + tempo):\n«Três cliques. O teu carro vendido em 72 horas.»\n«Escritórios impecáveis antes das 9h — sem tu precisares de lá estar.»\n«A tua contabilidade em dia, sem um único papel em cima da secretária.»';

function planPrompt(briefing: PlanBriefing, research?: ResearchNote | null, strategy?: Strategy | null): string {
  const researchBlock = research ? `\nPESQUISA REAL NA INTERNET (facto confirmado, usa-o):\n${research.title} — ${research.extract}\nFONTE: ${research.source}` : '';
  const hint = briefing.variantHint ? `\nÂNGULO DESTA PROPOSTA: ${briefing.variantHint}` : '';
  return `Cria uma Landing Page de conversão.\n${dateRule()}\nBRIEFING: ${briefing.description}\nOBJETIVO: ${briefing.objective}\nESTILO: ${briefing.style}\nCONTEXTO: ${JSON.stringify(briefing.context ?? {})}\nRESPOSTAS DO UTILIZADOR: ${JSON.stringify(briefing.answers ?? {})}${researchBlock}${strategyBlock(strategy)}${hint}\n\nCopy específica deste produto — headline com número/mecanismo/tempo, benefícios concretos, um único CTA repetido. Zero clichés genéricos («qualidade», «melhor solução», «soluções à medida» estão proibidos). Desarma as objeções na secção faq.\n${FEWSHOT}\n\nJSON: {name, objective, audience, offer, cta, brandColors[], visualDirection, visualQueries[], brandSummary, productSummary, questions:[{key,question,why,placeholder}], sections:[{type,title,style,elements}]}.\n${SIZE_RULES}\n${IMAGE_RULES}\n${LAYOUT_SPEC}\n${ELEMENT_SPEC}`;
}

/** Layouts válidos por tipo — também serve de escolha automática quando a IA ignora a regra. */
const DEFAULT_LAYOUTS: Record<string, string> = {
  hero: 'hero-split', benefits: 'benefits-grid', problem: 'benefits-zigzag', features: 'benefits-grid',
  social: 'testimonials-cards', proof: 'proof-stats', cta: 'cta-band', contact: 'form-split', form: 'form-split',
};
const KNOWN_LAYOUTS = new Set(['hero-split', 'hero-center', 'hero-fullbleed', 'benefits-grid', 'benefits-zigzag', 'proof-stats', 'testimonials-cards', 'cta-band', 'form-split', 'logo-marquee']);

function pickLayout(type: string, offered?: string): string | undefined {
  if (offered && KNOWN_LAYOUTS.has(offered)) return offered;
  return DEFAULT_LAYOUTS[type];
}

/** Normaliza secções devolvidas pelo provider para o contrato do Builder. */
function normalizeSections(raw: unknown[]): AiPlan['sections'] {
  return raw.map((s) => {
    const sec = (s ?? {}) as Record<string, unknown>;
    const style = (sec.style ?? {}) as Record<string, unknown>;
    const elements = Array.isArray(sec.elements) ? sec.elements : [];
    const type = String(sec.type ?? 'custom');
    return {
      type,
      title: String(sec.title ?? 'Secção'),
      style: {
        background: style.background ? String(style.background) : undefined,
        accent: style.accent ? String(style.accent) : undefined,
        layout: pickLayout(type, style.layout ? String(style.layout) : undefined),
      },
      elements: elements.map((e) => {
        const el = (e ?? {}) as Record<string, unknown>;
        const content = (el.content ?? {}) as Record<string, unknown>;
        // Alias tolerante: alguns modelos escrevem label/title dentro de content.
        if (el.type === 'text' && typeof content.text !== 'string' && typeof content.content === 'string') content.text = content.content;
        return { type: String(el.type ?? 'text'), content };
      }),
    };
  }) as AiPlan['sections'];
}

/**
 * Escolhe imagens com base no que a IA escreveu para cada slot:
 * usa o `alt` que ela pediu, os `visualQueries` e o resumo do produto.
 * Assim a foto corresponde ao conteúdo da página, nunca a um arquivo aleatório.
 */
function applyImages(plan: AiPlan): AiPlan {
  const pool = [plan.productSummary ?? '', plan.brandSummary ?? '', ...(plan.visualQueries ?? [])].filter(Boolean).join(' ');
  let i = 0;
  const fill = (c: Record<string, unknown>, sectionTitle: string, role: string) => {
    const query = `${String(c.alt ?? '')} ${sectionTitle} ${pool}`.trim();
    return pickImageForRole(query || pool, role, [], i++);
  };
  for (const s of plan.sections) {
    for (const el of s.elements) {
      const c = el.content as Record<string, unknown>;
      if (el.type === 'image' && !String(c.url ?? '').trim()) c.url = fill(c, s.title, s.type);
      if (el.type === 'gallery' && Array.isArray(c.images)) {
        for (const g of c.images as Array<Record<string, unknown>>) {
          if (!String(g.url ?? '').trim()) g.url = fill(g, s.title, s.type);
        }
      }
    }
  }
  // Rede de segurança: modelos que ignoram a regra das imagens devolvem páginas
  // só texto. Garante 1 imagem no hero e mais 2 nas secções de conteúdo.
  const hasImage = (s: AiPlan['sections'][number]) => s.elements.some((e) => e.type === 'image' || e.type === 'gallery');
  const withoutImage = plan.sections.filter((s) => !hasImage(s) && s.type !== 'form' && s.type !== 'faq');
  const hero = plan.sections.find((s) => s.type === 'hero');
  const wanted: AiPlan['sections'] = [];
  if (hero) wanted.push(hero);
  for (const s of withoutImage) if (!wanted.includes(s)) wanted.push(s);
  for (const s of wanted.slice(0, 3)) {
    if (!s || hasImage(s)) continue;
    const insertAt = s.elements.findIndex((e) => e.type === 'text' && (e.content as Record<string, unknown>).level === 'body');
    s.elements.splice(insertAt >= 0 ? insertAt + 1 : 1, 0, { type: 'image', content: { url: pickImageForRole(`${s.title} ${pool}`, s.type, [], i++), alt: s.title } } as unknown as AiPlan['sections'][number]['elements'][number]);
  }
  return plan;
}

/** Valida e normaliza o JSON de plano devolvido por um provider externo. */
function toPlan(raw: Record<string, unknown>): AiPlan {
  const sections = Array.isArray(raw.sections) ? normalizeSections(raw.sections) : [];
  if (!sections.length) throw new Error('O plano devolvido não tem secções.');
  return applyImages({
    source: 'provider',
    name: String(raw.name ?? 'Landing Page criada com IA'),
    objective: String(raw.objective ?? ''),
    audience: String(raw.audience ?? ''),
    offer: String(raw.offer ?? ''),
    cta: String(raw.cta ?? 'COMEÇAR AGORA'),
    brandColors: Array.isArray(raw.brandColors) ? (raw.brandColors as unknown[]).map(String).slice(0, 6) : [],
    visualDirection: String(raw.visualDirection ?? ''),
    visualQueries: Array.isArray(raw.visualQueries) ? (raw.visualQueries as unknown[]).map(String).slice(0, 4) : [],
    brandSummary: raw.brandSummary ? String(raw.brandSummary) : undefined,
    productSummary: raw.productSummary ? String(raw.productSummary) : undefined,
    questions: Array.isArray(raw.questions)
      ? (raw.questions as unknown[]).map((q, i) => {
          if (typeof q === 'string') return { key: `q${i}`, question: q, why: 'Ajuda a tornar a página mais específica.', placeholder: 'Escreva a resposta' };
          const o = q as Record<string, unknown>;
          return { key: String(o.key ?? `q${i}`), question: String(o.question ?? ''), why: String(o.why ?? ''), placeholder: String(o.placeholder ?? '') };
        })
      : [],
    sections,
  });
}

export const httpProvider: AiProvider = {
  name: 'http',
  /** Motivo da última degradação para local (visível na análise para diagnóstico). */
  lastFallbackReason: undefined as string | undefined,

  async plan(briefing: PlanBriefing): Promise<AiPlan> {
    const config = envConfig();
    if (!config) throw new Error('AI_PROVIDER=http mas AI_BASE_URL não está definido em .env.local.');
    // Tenta a cadeia de modelos; se todos falharem (rate limit do free tier),
    // espera 2,5s e tenta outra vez antes de degradar para o motor local.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Pesquisa real na Internet antes de pedir — o modelo escreve com factos, não a adivinhar.
        const research = await researchSubject(`${briefing.description} ${Object.values(briefing.answers ?? {}).join(' ')}`);
        // Passe 1: estratégia de copy (cacheada). Se falhar, o passe 2 segue só com o briefing.
        const strategy = await strategyPass(config, briefing, research);
        const text = await chatWithFallback(config, SYSTEM_PROMPT, planPrompt(briefing, research, strategy));
        const plan = toPlan(extractJson(text));
        this.lastFallbackReason = undefined;
        return plan;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ai/http] tentativa ${attempt + 1} falhou:`, message);
        this.lastFallbackReason = message;
        if (attempt === 0 && /429|vazio|JSON/.test(message)) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        // Falha de rede/JSON não pode matar o fluxo: degrada para o motor local.
        const local = await localProvider.plan(briefing);
        (local as { fallbackReason?: string }).fallbackReason = message;
        return local;
      }
    }
    const last = await localProvider.plan(briefing);
    (last as { fallbackReason?: string }).fallbackReason = this.lastFallbackReason;
    return last;
  },

  async rewrite(request: RewriteRequest): Promise<string> {
    const config = envConfig();
    if (!config) return localProvider.rewrite(request);
    try {
      const hasCtx = request.context && Object.values(request.context).some((v) => typeof v === 'string' ? v.trim() : v);
      const user = `${dateRule()}\nInstrução: ${request.instruction}\nTexto atual: ${request.current}${hasCtx ? `\nContexto da marca: ${JSON.stringify(request.context)}` : ''}\nReescreve APENAS esse texto, mantendo o facto central. Nunca copies símbolos do pedido (como {}). Devolve APENAS o novo texto, sem aspas nem explicações.`;
      return (await chatWithFallback(config, 'Reescreve textos de Landing Pages em português europeu (PT-PT), tratando o leitor por "tu" (teu/tua, imperativo "pede/reserva"). NUNCA uses formas brasileiras: "você", "seu/sua" solto, "a gente", "gerúndio no lugar de infinitivo". Mantém o facto central e o comprimento razoável.', user)).trim();
    } catch {
      return localProvider.rewrite(request);
    }
  },

  async section(request: SectionRequest) {
    const config = envConfig();
    if (!config) return localProvider.section(request);
    try {
      const user = `Cria UMA nova secção para uma Landing Page.\n${dateRule()}\nPEDIDO: ${request.description}\nOBJETIVO: ${request.objective ?? 'Captar leads'}\nCONTEXTO: ${JSON.stringify(request.context ?? {})}\nDevolve JSON: {type,title,style,elements:[{type,content}]}.`;
      const raw = extractJson(await chatWithFallback(config, SYSTEM_PROMPT, user));
      const elements = Array.isArray(raw.elements) ? (raw.elements as AiSectionDraft['elements']) : [];
      if (!elements.length) return localProvider.section(request);
      return {
        type: String(raw.type ?? 'custom'),
        title: String(raw.title ?? 'Nova secção'),
        style: (raw.style as Record<string, never>) ?? undefined,
        elements,
      };
    } catch {
      return localProvider.section(request);
    }
  },

  /**
   * Interpreta o pedido em linguagem natural e traduz a INTENÇÃO em tags de
   * pesquisa concretas (inglês) — o modelo lê "equipa jovem num escritório
   * moderno" e devolve ["office team", "young professionals"]. Sem este passe
   * a pesquisa ficava limitada ao dicionário PT→EN de ~60 palavras.
   */
  async image(request: ImageRequest): Promise<ImageChoice> {
    const config = envConfig();
    if (!config) return localProvider.image(request);
    try {
      const user = `O utilizador quer mudar a imagem de um bloco de uma Landing Page.\nPEDIDO: ${request.instruction}\nNEGÓCIO: ${JSON.stringify({ objective: request.objective ?? '', product: request.context?.productSummary ?? '', visual: request.context?.visualDirection ?? '', queries: request.context?.visualQueries ?? [] })}\n\nDevolve APENAS JSON: {"tags":["tag-1","tag-2"],"alt":"descrição em PT-PT do que a foto deve mostrar"}.\nTAGS: 2-3 termos em inglês que PHOTOGRAPHERS usam no Flickr (pessoas/objetos/locais concretos, sem stopwords, sem "business" genérico se houver alternativa específica). A cena REAL que o pedido descreve, não conceitos abstratos.`;
      const raw = extractJson(await chatWithFallback(config, 'Traduz intenções visuais de design em tags de pesquisa fotográfica. Devolves apenas JSON válido.', user));
      const tags = Array.isArray(raw.tags) ? (raw.tags as unknown[]).map(String).filter((t) => /^[a-z0-9\s-]{2,40}$/i.test(t)).slice(0, 3) : [];
      if (!tags.length) throw new Error('modelo não devolveu tags');
      const alt = typeof raw.alt === 'string' && raw.alt.trim() ? raw.alt.trim() : request.instruction;
      return {
        url: pickByTags(tags, request.exclude ?? [], Math.floor(Math.random() * 1000)),
        alt,
        source: 'ai',
      };
    } catch {
      return localProvider.image(request);
    }
  },
};
