import type { AiPlan, BuilderElement } from '../types';
import { pickImage } from './images';
import { researchSubject, type ResearchNote } from './research';
import type { AiProvider, ImageChoice, ImageRequest, PlanBriefing, RewriteRequest, SectionRequest } from './types';

/**
 * Motor determinístico em português de Portugal.
 * Analisa o briefing por verticais (automóvel, imobiliário, restauração…),
 * extrai o assunto do pedido e compõe uma página com copy e secções
 * específicas desse setor — não um template único para tudo.
 */

function nid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Adiciona ids aos elementos brutos, cumprindo o contrato BuilderElement. */
function stamp(draft: { type: string; title: string; style?: Record<string, unknown>; elements: Array<{ type: string; content: Record<string, unknown> }> }) {
  return {
    ...draft,
    elements: draft.elements.map((e) => ({ id: nid(), type: e.type as BuilderElement['type'], content: e.content })),
  };
}

const REGIONS = ['Covilhã', 'Fundão', 'Castelo Branco', 'Guarda', 'Belmonte', 'Sabugal',
  'Viseu', 'Vila Real', 'Portalegre', 'Braga', 'Porto', 'Lisboa', 'Coimbra', 'Aveiro'];

/* ─────────── verticais ─────────── */

interface Vertical {
  id: string;
  keywords: RegExp;
  name: string;
  /** Copy com {subject} e {audience} substituídos. */
  heroTitle: string;
  heroBody: string;
  cta: string;
  problemTitle: string;
  problemBody: string;
  benefitsTitle: string;
  benefits: string[];
  faq: Array<{ q: string; a: string }>;
  imagesQuery: string;
  /** Secções extra específicas da vertical (opcional). */
  extra?: (subject: string, seed: number) => RawSection[];
}

interface RawElement { type: string; content: Record<string, unknown> }
type RawSection = { type: string; title: string; style?: Record<string, unknown>; elements: RawElement[] };

const VERTICALS: Vertical[] = [
  {
    id: 'automovel',
    keywords: /carros?|automov|viatura|stand\b|seminov|km0|km 0|motas?|oficina|revis[ôo]es|conduz|matricul/i,
    name: 'Automóvel',
    heroTitle: '{subject}: a estrada é sua.',
    heroBody: 'Viaturas revistos, garantia incluída e financiamento à sua medida. Venha ver, conduzir e decidir — sem pressa e sem surpresas.',
    cta: 'MARCAR TEST-DRIVE',
    problemTitle: 'Comprar um carro não devia ser um risco.',
    problemBody: 'Histórico incerto, preços sem sentido e pressão comercial. Aqui é ao contrário: transparência total, do quilometragem ao histórico de serviço.',
    benefitsTitle: 'Porque comprar connosco',
    benefits: ['Garantia de 18 meses em todas as viaturas', 'Histórico de serviço e inspeção certificados', 'Test-drive sem compromisso', 'Financiamento aprovado em 24h', 'Entrega em todo o país'],
    faq: [
      { q: 'As viaturas têm garantia?', a: 'Sim. Todas as viaturas incluem garantia mínima de 18 meses, com possibilidade de extensão.' },
      { q: 'Posso entregar o meu carro como parte do pagamento?', a: 'Sim. Fazemos avaliação gratuita do seu veículo no próprio dia.' },
      { q: 'É possível testar antes de comprar?', a: 'Claro. Marque um test-drive e conduza sem compromisso.' },
    ],
    imagesQuery: 'carros',
    extra: (subject, seed) => [{
      type: 'destaques', title: 'Viaturas em destaque', style: { background: '#0c1423', accent: '#4f7cff' },
      elements: [
        { type: 'text', content: { text: 'Stock fresco, semanalmente.', level: 'title' } },
        { type: 'gallery', content: { images: [1, 2, 3].map((i) => ({ url: pickImage('carros', [], seed + i), alt: `Viatura em destaque ${i}` })) } },
        { type: 'pricing', content: { plans: [
          { name: 'Citadino', price: 'desde 7.900€', features: [`${new Date().getFullYear() - 4}+`, 'Garantia 18 meses', 'Revisão completa'] },
          { name: 'Família', price: 'desde 14.500€', features: ['Híbrido', 'Garantia 18 meses', 'Iva discriminado'] },
          { name: 'Premium', price: 'desde 29.900€', features: ['Equipamento top', 'Garantia extendida', 'Entrega grátis'] },
        ] } },
      ],
    }],
  },
  {
    id: 'imobiliario',
    keywords: /im[oó]ve|casas?\b|apartamento|moradia|habita|arrendamento|imobili|t[0-3]\b|quarto|escrit[oó]rio\b|loja\b|comercial|reabilita/i,
    name: 'Imobiliário',
    heroTitle: '{subject} — o próximo capítulo começa aqui.',
    heroBody: 'Acompanhamento de A a Z: avaliação, financiamento, burocracia e entrega de chaves. Você só trata da mudança.',
    cta: 'MARCAR VISITA',
    problemTitle: 'Encontrar casa certa não pode depender de sorte.',
    problemBody: 'Anúncios desatualizados, visitas perdidas e processos intermináveis. Nós filtramos, validamos e apresentamos só o que faz sentido para si.',
    benefitsTitle: 'O que fazemos por si',
    benefits: ['Seleção de imóveis segundo o seu perfil', 'Avaliação honesta ao preço de mercado', 'Tratamos de papelada e certificado', 'Parcerias de financiamento', 'Fotografia profissional do seu imóvel'],
    faq: [
      { q: 'Quanto tempo demora uma venda?', a: 'Em média 45 a 60 dias entre contrato e escritura, com todo o processo acompanhado.' },
      { q: 'Que comissão é praticada?', a: 'Comissão única, combinada por escrito antes de qualquer anúncio. Sem surpresas.' },
    ],
    imagesQuery: 'imove casa',
    extra: (subject, seed) => [{
      type: 'imoveis', title: 'Imóveis em destaque', style: { background: '#f6f1e8' },
      elements: [
        { type: 'text', content: { text: 'Uma amostra do que temos para si.', level: 'title' } },
        { type: 'gallery', content: { images: [1, 2, 3].map((i) => ({ url: pickImage('imove casa', [], seed + i), alt: `Imóvel em destaque ${i}` })) } },
      ],
    }],
  },
  {
    id: 'restauracao',
    keywords: /restaurante|comida|jantar|pizza|sushi|marisco|\bmenu\b|chef|cozinha|gastronom|caf[eé]|petisco|takeaway|bistr[oô]|tapas|\bcomer\b/i,
    name: 'Restauração',
    heroTitle: '{subject}: mesa reservada, memória garantida.',
    heroBody: 'Produtos da época, receitas com história e um serviço que se lembra do seu nome. Reserve a sua mesa.',
    cta: 'RESERVAR MESA',
    problemTitle: 'Comer fora devia ser um acontecimento.',
    problemBody: 'Demasiados sítios iguais, pressa e comida esquecível. Aqui o menu muda com as estações e a cozinha é vista, não escondida.',
    benefitsTitle: 'À sua espera',
    benefits: ['Carta sazonal com produto local', 'Opções vegetarianas em todos os menus', 'Adega com referências únicas', 'Espaço para grupos e eventos', 'Reserva confirmada em minutos'],
    faq: [
      { q: 'Aceitam reservas online?', a: 'Sim. Use o formulário e recebe confirmação imediata.' },
      { q: 'Têm opções para alergias?', a: 'Sim, com carta adaptada. Informe-nos no momento da reserva.' },
    ],
    imagesQuery: 'restaurante comida',
    extra: (subject, seed) => [{
      type: 'especialidades', title: 'Especialidades da casa', style: { background: '#0e1830', accent: '#d26cff' },
      elements: [
        { type: 'gallery', content: { images: [1, 2, 3].map((i) => ({ url: pickImage('comida prato', [], seed + i), alt: `Prato da casa ${i}` })) } },
        { type: 'text', content: { text: 'Entradas, pratos e sobremesas que mudam com o mercado — sempre com o melhor da época.', level: 'body' } },
      ],
    }],
  },
  {
    id: 'formacao',
    keywords: /curso|formac|escola|aulas?|masterclass|academia|workshop|certifica|learning|alunos?|estudante/i,
    name: 'Formação',
    heroTitle: '{subject} — o conhecimento que fica.',
    heroBody: 'Formação prática, casos reais e acompanhamento próximo. No fim, sai com algo que aplica na segunda-feira.',
    cta: 'GARANTIR A MINHA VAGA',
    problemTitle: 'A formação tradicional raramente fica.',
    problemBody: 'Slides eternos e zero prática. Invertemos: 20% teoria, 80% exercício com feedback, e material que é seu para sempre.',
    benefitsTitle: 'Como aprende connosco',
    benefits: ['Turmas pequenas com acompanhamento', 'Exercícios com dados reais', 'Certificado reconhecido', 'Acesso às gravações 12 meses', 'Comunidade pós-formação'],
    faq: [
      { q: 'Serve para principiantes?', a: 'Sim. Cada formação começa do zero e progride até ao nível profissional.' },
      { q: 'O certificado é reconhecido?', a: 'Sim. Emitimos certificado digital verificável na conclusão.' },
    ],
    imagesQuery: 'formacao curso',
  },
  {
    id: 'saude',
    keywords: /clinica|saude|dentista|medic[oa]|fisioterapia|terapia|bem[- ]?estar|consulta|exame|psic[oó]log|nutricionista/i,
    name: 'Saúde',
    heroTitle: '{subject}: cuidar de si, sem espera.',
    heroBody: 'Equipa experiente, tecnologia atual e marcações no próprio dia. A sua saúde não fica em lista de espera.',
    cta: 'MARCAR CONSULTA',
    problemTitle: 'Problemas de saúde não esperam. Nós também não.',
    problemBody: 'Tempo de espera, falta de explicação e tratamentos confusos são a norma. Aqui cada plano é explicado em linguagem simples, antes de começar.',
    benefitsTitle: 'A sua experiência',
    benefits: ['Marcação em menos de 24h', 'Primeira consulta com diagnóstico claro', 'Plano de tratamento por escrito', 'Follow-up incluído', 'Parcerias com seguradoras'],
    faq: [
      { q: 'Aceitam seguros de saúde?', a: 'Sim, com as principais seguradoras. Confirme a sua antes da marcação.' },
      { q: 'Quanto demora uma consulta?', a: 'Entre 30 e 45 minutos — tempo para explicar tudo sem pressa.' },
    ],
    imagesQuery: 'clinica saude',
  },
  {
    id: 'fitness',
    keywords: /gimnas|ginasio|fitness|treinos?|crossfit|yoga|pilates|personal trainer|desporto|muscula/i,
    name: 'Fitness',
    heroTitle: '{subject}: a versão de si que ainda não conheceu.',
    heroBody: 'Planos à medida, acompanhamento real e uma comunidade que não o deixa desistir. Primeira aula é por nossa conta.',
    cta: 'TESTAR GRÁTIS',
    problemTitle: 'A maioria dos planos falha em fevereiro.',
    problemBody: 'Não por falta de vontade — por falta de acompanhamento. Aqui tem plano, técnica corrigida e gente que sabe o seu nome.',
    benefitsTitle: 'O que inclui',
    benefits: ['Avaliação física inicial gratuita', 'Plano mensal com progressão medida', 'Aulas em grupo e livres', 'App com treinos e dieta', 'Sem fidelização'],
    faq: [
      { q: 'Preciso de experiência?', a: 'Não. Cada treino tem progressão para todos os níveis.' },
      { q: 'Posso experimentar antes de pagar?', a: 'Sim. A primeira aula é gratuita, sem cartão.' },
    ],
    imagesQuery: 'gimnasio treino',
  },
  {
    id: 'viagens',
    keywords: /viagens?|travel|tour|f[eé]rias|hotel|resort|excursa|destino|retiro|alojamento|guia turistico/i,
    name: 'Viagens',
    heroTitle: '{subject}: vá, nós tratamos do resto.',
    heroBody: 'Roteiros desenhados à mão, parceiros locais testados e suporte 24/7 em viagem. Só tem de fazer a mala.',
    cta: 'PEDIR PROPOSTA',
    problemTitle: 'Planear uma viagem não devia ser outra viagem.',
    problemBody: 'Dez separadores, preços que mudam, medo de cair em golpes. Um especialista único resolve tudo, por escrito.',
    benefitsTitle: 'Viaje com a vantagem',
    benefits: ['Proposta em menos de 48h', 'Preço fechado, sem taxas escondidas', 'Guías locais que falam português', 'Cancelação flexível', 'Assistência 24/7 durante a viagem'],
    faq: [
      { q: 'Os voos estão incluídos?', a: 'Conforme a proposta — pode incluir ou não. Tudo por escrito antes de pagar.' },
      { q: 'Posso personalizar o roteiro?', a: 'Sempre. Cada viagem parte do seu interesse, não de um catálogo.' },
    ],
    imagesQuery: 'viagem paisagem',
  },
  {
    id: 'moda',
    keywords: /moda|roupas?|vestuar|textil|calcad|acessorios|coleca|tshirt|camis|\btee\b|camiset/i,
    name: 'Moda',
    heroTitle: '{subject}: peças com carácter, não com etiqueta genérica.',
    heroBody: 'Coleções em edição limitada, produção local e trocas sem drama. Vista a diferença.',
    cta: 'VER A COLEÇÃO',
    problemTitle: 'Demasiada roupa, pouco estilo.',
    problemBody: 'Moda rápida que descola à primeira lavagem. Nós fazemos o inverso: menos peças, melhor tecido, gente que as faz com nome.',
    benefitsTitle: 'Diferenças que se sentem',
    benefits: ['Tecidos certificados e duráveis', 'Edições limitadas numeradas', 'Produção em Portugal', 'Trocas grátis em 30 dias', 'Envio em 48h'],
    faq: [
      { q: 'Podem trocar se não servir?', a: 'Sim, trocas grátis em 30 dias, sem perguntas.' },
      { q: 'As peças encolhem?', a: 'Não. Usamos apenas tecidos pré-lavados e testados.' },
    ],
    imagesQuery: 'moda roupa',
  },
  {
    id: 'evento',
    keywords: /evento|encontro|confer[eê]ncia|congresso|summit|workshop|semin[aá]rio|webinar|jantar empresarial/i,
    name: 'Evento',
    heroTitle: '{subject}',
    heroBody: 'Uma manhã de exemplos reais, sem teoria a mais. Quem sai de lá, sai com ideias para aplicar no próprio negócio.',
    cta: 'RESERVAR O MEU LUGAR',
    problemTitle: 'A IA já mudou o seu setor. A pergunta é onde.',
    problemBody: 'Casos de estudo de empresas reais, erros incluídos. Nada de paleinas de palco — mesa aberta e perguntas diretas.',
    benefitsTitle: 'Porque participar',
    benefits: ['Casos reais com números', 'Contacto direto com quem faz', 'Workshop hands-on', 'Networking com pausa para café', 'Gravações para quem não faltar'],
    faq: [
      { q: 'Para quem é este encontro?', a: 'Para empresários, decisores e profissionais que querem aplicar IA já.' },
      { q: 'Vou receber as gravações?', a: 'Sim, todos os participantes recebem o acesso completo.' },
    ],
    imagesQuery: 'evento conferência',
    extra: (subject, seed) => [
      {
        type: 'programa', title: 'Programa', style: { background: '#0e1830', accent: '#5d54d8' },
        elements: [
          { type: 'text', content: { text: 'Um dia, três blocos, zero teoria a mais.', level: 'title' } },
          { type: 'text', content: { text: '09h00 — Acreditação e café\n10h00 — Keynote: IA aplicada, com números\n12h30 — Almoço networking\n14h00 — Painel de empresários: o que resultou e o que falhou\n16h00 — Workshop hands-on\n18h00 — Brinde de encerramento', level: 'body' } },
        ],
      },
      {
        type: 'oradores', title: 'Oradores', style: { background: '#ffffff' },
        elements: [
          { type: 'text', content: { text: 'Quem sobe ao palco.', level: 'title' } },
          { type: 'testimonials', content: { items: [1, 2, 3].map((i) => ({ name: `Orador ${i}`, role: 'Empresa / cargo (substituir)', text: 'Área de intervenção no evento.' })) } },
        ],
      },
      {
        type: 'bilhetes', title: 'Bilhetes', style: { background: '#f5f7fb' },
        elements: [
          { type: 'text', content: { text: 'Escolhe o teu bilhete.', level: 'title' } },
          { type: 'pricing', content: { plans: [
            { name: 'Standard', price: 'Gratuito', features: ['Acesso a keynotes e painel', 'Coffee-break'], cta: 'Reservar' },
            { name: 'Premium', price: '49€', features: ['Tudo do Standard', 'Lugar na plateia', 'Almoço de networking'], cta: 'Reservar' },
            { name: 'VIP', price: '99€', features: ['Tudo do Premium', 'Workshop exclusivo', 'Balcão de contactos com oradores'], cta: 'Reservar' },
          ] } },
        ],
      },
    ],
  },
  {
    id: 'tecnologia',
    keywords: /\bia\b|intelig[eê]ncia artificial|software|plataforma|app\b|saas|automa[çc][aã]o|digital|dados|rob[oô]|sistemas?|erp\b|crm\b|online|internet|\bweb\b|aplica[çc][aã]o/i,
    name: 'Tecnologia',
    heroTitle: '{subject}: feito para trabalhar por si.',
    heroBody: 'Implementação rápida, integrações sem dramas e um resultado que se mede em horas poupadas, não em slides.',
    cta: 'PEDIR DEMONSTRAÇÃO',
    problemTitle: 'Tecnologia que não dá retorno é só despesa.',
    problemBody: 'Ferramentas bonitas que ninguém usa. Nós construímos o que a sua equipa usa na segunda-feira de manhã.',
    benefitsTitle: 'O que entrega',
    benefits: ['Setup em semanas, não trimestres', 'Integração com as suas ferramentas', 'Formação da equipa incluída', 'Suporte com humano do outro lado', 'Métricas de ROI desde o dia 1'],
    faq: [
      { q: 'Quanto tempo até estar operacional?', a: 'Na maioria dos casos, entre 2 a 4 semanas com dados reais a circular.' },
      { q: 'Os meus dados ficam seguros?', a: 'Sim. Cifra em trânsito e em repouso, e pode exigir residência na UE.' },
    ],
    imagesQuery: 'tecnologia software',
  },
  {
    id: 'servicos',
    keywords: /servi[cç]os?|consultoria|advog|contab|engenharia|obras?|reforma|limpezas?|seguros?|financiamento|repara/i,
    name: 'Serviços',
    heroTitle: '{subject}: resolvido, sem lhe dar trabalho.',
    heroBody: 'Diagnóstico claro, orçamento fechado e prazos que cumprimos. Se algo correr mal, tratamos — não explicamos porque não podíamos tratar.',
    cta: 'PEDIR ORÇAMENTO',
    problemTitle: 'Bons profissionais são raros. Nós somos a raridade.',
    problemBody: 'Orçamentos que sobem, prazos que escorregam, chamadas sem resposta. Contratos por escrito, atualizações regulares, ponto final.',
    benefitsTitle: 'Como trabalhamos',
    benefits: ['Orçamento gratuito e fechado', 'Prazo com penalização contratual', 'Interlocutor único', 'Fotografias de progresso', 'Garantia de 2 anos'],
    faq: [
      { q: 'O orçamento é mesmo gratuito?', a: 'Sim, sem compromisso e sem letras pequenas.' },
      { q: 'Trabalham fora da zona?', a: 'Sim, com deslocação avaliada caso a caso.' },
    ],
    imagesQuery: 'serviços profissionais',
  },
];

/* ─────────── análise do briefing ─────────── */

interface BriefingSignals {
  vertical: Vertical;
  /** true quando o pedido bateu nas keywords de uma vertical específica. */
  matched: boolean;
  subject: string;
  brand?: string;
  locations: string[];
  hasDate: boolean;
  hasContact: boolean;
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fillCopy(template: string, subject: string, audience: string): string {
  return template.replace(/\{subject\}/g, subject).replace(/\{audience\}/g, audience);
}

function answersText(answers?: Record<string, string>): string {
  return Object.entries(answers ?? {}).filter(([, v]) => String(v).trim()).map(([, v]) => String(v).trim()).join(' ');
}

/** Extrai o assunto do pedido: nome da marca/produto quando dito, senão a palavra-chave da vertical com artigo. */
function extractSubject(description: string, answers: Record<string, string> | undefined, v: Vertical): string {
  const answerVal = answers?.product ?? answers?.brand;
  if (answerVal) return answerVal.trim().slice(0, 60);
  const quoted = description.match(/[«"']([^»"']{2,40})[»"']/);
  if (quoted) return quoted[1];
  const named = description.match(/(?:chama-se|designa-se|nome(?:da (?:empresa|marca|loja))?[:\s]+[«"']?([A-ZÀ-Ú][\w&'-]{1,30}))/);
  if (named) return named[1];
  const m = description.match(new RegExp(`\\b(${v.keywords.source.replace(/\\/g, '\\')})\\b`, 'i'));
  if (m) {
    const word = m[1].toLowerCase();
    const article = /(s)$/.test(word) ? 'os' : 'o';
    return `${article} ${word}`;
  }
  // Sem keyword da vertical: usar a primeira palavra substantiva do pedido.
  const STOP = new Set(['landing', 'pagina', 'page', 'quero', 'preciso', 'gostaria', 'para', 'com', 'uma', 'meu', 'minha', 'portfolio', 'profissional', 'moderno', 'estilo', 'dark', 'site', 'criar', 'vender', 'desta', 'poder', 'sobre', 'mais', 'como', 'isso', 'tudo', 'tambem', 'quando', 'porque', 'pessoas', 'clientes', 'online']);
  const candidate = norm(description).split(/[^a-z0-9]+/).filter((w) => w.length > 4 && !STOP.has(w))[0];
  if (!candidate) return 'a nossa proposta';
  return candidate.endsWith('s') ? `os ${candidate}` : `o ${candidate}`;
}

function readSignals(briefing: PlanBriefing): BriefingSignals {
  const merged = `${briefing.description} ${answersText(briefing.answers)} ${briefing.context?.productSummary ?? ''}`;
  const lower = norm(merged);
  const hit = VERTICALS.find((v) => v.keywords.test(lower));
  const vertical = hit ?? VERTICALS.find((v) => v.id === 'servicos')!;
  if (briefing.objective === 'Divulgar evento' && vertical.id !== 'evento') {
    const evento = VERTICALS.find((v) => v.id === 'evento')!;
    return { vertical: evento, matched: true, subject: extractSubject(briefing.description, briefing.answers, evento), locations: REGIONS.filter((r) => lower.includes(norm(r))), hasDate: /data|dia ?\d|\d{1,2}[\/-]\d{1,2}|janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i.test(lower), hasContact: /contacto|email|telefone|telem|whatsapp|@/.test(lower) };
  }
  return {
    vertical,
    matched: Boolean(hit),
    subject: extractSubject(briefing.description, briefing.answers, vertical),
    locations: REGIONS.filter((r) => lower.includes(norm(r))),
    hasDate: /data|dia ?\d|\d{1,2}[\/-]\d{1,2}/.test(lower),
    hasContact: /contacto|email|telefone|telem|whatsapp|@/.test(lower),
  };
}

function questionsFor(s: BriefingSignals, briefing: PlanBriefing): AiPlan['questions'] {
  const merged = norm(`${briefing.description} ${answersText(briefing.answers)}`);
  const qs: AiPlan['questions'] = [];
  if (!/empresa|marca|nome|somos|chama/.test(merged) && !briefing.context?.brandSummary) {
    qs.push({ key: 'brand', question: 'Qual é o nome da empresa ou marca?', why: 'A marca deve aparecer no topo da página e nos textos.', placeholder: 'Nome da empresa' });
  }
  if (!briefing.context?.productSummary && !s.vertical.keywords.test(merged)) {
    qs.push({ key: 'product', question: `O que exatamente vai ser ${s.vertical.name.toLowerCase()}? Dê um exemplo concreto.`, why: 'Permite escrever textos específicos em vez de genéricos.', placeholder: 'Ex.: viaturas seminovas até 20.000€' });
  }
  if (s.vertical.id === 'evento') {
    if (!s.hasDate) qs.push({ key: 'eventDate', question: 'Qual é a data e hora do evento?', why: 'Fecha o Hero e elimina dúvidas sobre disponibilidade.', placeholder: 'Ex.: 15 de outubro, 14h' });
    if (!/local|morada|audit|sala|hotel/.test(merged)) qs.push({ key: 'eventPlace', question: 'Onde vai acontecer?', why: 'O local aumenta confiança.', placeholder: 'Local ou morada' });
  }
  if (!/pre[cç]o|valor|custa|gr[tã]tis|desde/.test(merged) && ['automovel', 'imobiliario', 'viagens', 'formacao'].includes(s.vertical.id)) {
    qs.push({ key: 'price', question: 'Há um valor de referência (mesmo "desde…")?', why: 'Preços visíveis filtram curiosos e aumentam a qualificação dos leads.', placeholder: 'Ex.: desde 7.900€' });
  }
  if (!s.hasContact) {
    qs.push({ key: 'contact', question: 'Que contacto deve aparecer na página?', why: 'Dá ao visitante uma alternativa ao formulário.', placeholder: 'Email, telefone ou WhatsApp' });
  }
  return qs.slice(0, 4);
}

/* ─────────── composição da página ─────────── */

const DARK = ['#0c1423', '#0e1830', '#111827'];
const LIGHT = ['#f6f1e8', '#f5f7fb', '#eef2f7'];

/** Query de imagem: vertical conhecida primeiro; sem vertical, só o assunto (força pesquisa web real). */
function imageQuery(s: BriefingSignals): string {
  return s.matched ? `${s.vertical.imagesQuery} ${s.subject}` : s.subject;
}

/**
 * Arquétipos de página — o mesmo briefing pode sair em composições diferentes.
 * Cada criação usa um seed do relógio, por isso "criar outra vez" nunca repet
 * o mesmo layout: muda a ordem das secções, o peso do hero, as cores base e
 * o tipo de prova social usada.
 */
const ARCHETYPES = ['classica', 'vitrine', 'autoridade', 'direta'] as const;

interface Ctx {
  s: BriefingSignals;
  v: Vertical;
  audience: string;
  subjectCap: string;
  cta: string;
  darkBg: string;
  lightBg: string;
  accent: string;
  seed: number;
}

function heroSection(c: Ctx, imageFirst: boolean): RawSection {
  const title = { type: 'text', content: { text: fillCopy(c.v.heroTitle, c.subjectCap, c.audience), level: 'heading' as const, hero: true } };
  const body = { type: 'text', content: { text: fillCopy(c.v.heroBody, c.subjectCap, c.audience), level: 'body' as const } };
  const button = { type: 'button', content: { label: c.cta, url: '#form', variant: 'primary' } };
  const image = { type: 'image', content: { url: pickImage(imageQuery(c.s), [], c.seed), alt: c.subjectCap } };
  return {
    type: 'hero', title: 'Hero', style: { background: c.darkBg, accent: c.accent },
    elements: imageFirst ? [image, title, body, button] : [title, body, button, image],
  };
}

function problemSection(c: Ctx): RawSection {
  return {
    type: 'problem', title: 'O problema', style: { background: c.lightBg },
    elements: [
      { type: 'text', content: { text: c.v.problemTitle, level: 'title' } },
      { type: 'text', content: { text: c.v.problemBody, level: 'body' } },
    ],
  };
}

function benefitsSection(c: Ctx): RawSection {
  return {
    type: 'benefits', title: c.v.benefitsTitle, style: { background: c.darkBg, accent: c.accent },
    elements: [
      { type: 'text', content: { text: c.v.benefitsTitle + '.', level: 'title' } },
      { type: 'pricing', content: { plans: c.v.benefits.slice(0, 3).map((b) => ({ name: b.split(/[,.;]/)[0], price: 'incluído', features: [b], cta: '' })) } },
    ],
  };
}

function stepsSection(c: Ctx): RawSection {
  return {
    type: 'how', title: 'Como funciona', style: { background: c.lightBg },
    elements: [
      { type: 'text', content: { text: 'Três passos. Zero complicações.', level: 'title' } },
      { type: 'text', content: { text: `1. Fala connosco (2 minutos)\n2. Recebe proposta clara e sem letras pequenas\n3. ${c.cta.toLowerCase()} e está feito`, level: 'body' } },
    ],
  };
}

function trustSection(c: Ctx): RawSection {
  const variants = [
    {
      type: 'trust', title: 'Quem já passou por aqui', style: { background: '#ffffff' },
      elements: [
        { type: 'image', content: { url: pickImage(`${c.v.imagesQuery} cliente`, [], c.seed + 2), alt: 'Clientes' } },
        { type: 'testimonials', content: { items: [{ name: 'Nome real de cliente', role: 'O que compraram', text: 'Substitua por um testemunho verdadeiro — este é o campo mais forte de conversão da página.' }] } },
      ],
    },
    {
      type: 'trust', title: 'Resultados que falam por nós', style: { background: '#ffffff' },
      elements: [
        { type: 'text', content: { text: `${c.subjectCap} — números, não promessas.`, level: 'title' } },
        { type: 'testimonials', content: { items: [
          { name: 'Cliente 1', role: 'O que comprou', text: 'Testemunho real com resultado concreto (substituir).' },
          { name: 'Cliente 2', role: 'O que comprou', text: 'Outro exemplo verdadeiro, com o problema resolvido.' },
          { name: 'Cliente 3', role: 'O que comprou', text: 'Mais uma prova — páginas com nomes reais convertem o dobro.' },
        ] } },
      ],
    },
  ];
  return variants[c.seed % variants.length];
}

function faqSection(c: Ctx): RawSection {
  return {
    type: 'faq', title: 'Perguntas frequentes', style: { background: c.lightBg },
    elements: [{ type: 'faq', content: { items: c.v.faq } }],
  };
}

function formSection(c: Ctx): RawSection {
  return {
    type: 'form', title: c.v.id === 'evento' ? 'Inscrição' : 'Falar connosco', style: { background: c.darkBg, accent: c.accent },
    elements: [
      {
        type: 'form',
        content: {
          title: c.cta.charAt(0) + c.cta.slice(1).toLowerCase(),
          fields: [
            { label: 'Nome', type: 'text', required: true },
            { label: 'Email', type: 'email', required: true },
            { label: 'Telefone', type: 'tel', required: true },
            { label: 'Mensagem', type: 'textarea', required: false },
          ],
          submit: c.cta,
          success: 'Recebemos o seu pedido. Respondemos em menos de 24 horas úteis.',
          consent: true,
        },
      },
    ],
  };
}

function finalCtaSection(c: Ctx): RawSection {
  return {
    type: 'cta', title: 'Último passo', style: { background: c.accent, accent: c.darkBg },
    elements: [
      { type: 'text', content: { text: 'Sem compromisso. Só o próximo passo.', level: 'title' } },
      { type: 'button', content: { label: c.cta, url: '#form', variant: 'primary' } },
    ],
  };
}

/** Secção com factos reais pesquisados na Internet pelo agente (Wikipedia/DDG). */
function researchSection(c: Ctx, note: ResearchNote): RawSection {
  return {
    type: 'sabia', title: 'Sabia que…?', style: { background: c.lightBg },
    elements: [
      { type: 'text', content: { text: `Sobre ${note.title.toLowerCase()}`, level: 'title' } },
      { type: 'text', content: { text: note.extract, level: 'body' } },
      { type: 'button', content: { label: 'Ver fonte da informação', url: note.source, variant: 'secondary' } },
    ],
  };
}

function buildSections(s: BriefingSignals, briefing: PlanBriefing, colors: string[], seed: number, research?: ResearchNote | null): RawSection[] {
  const audience = briefing.context?.audience ?? 'quem procura exatamente o que oferece';
  const subjectCap = s.subject.charAt(0).toUpperCase() + s.subject.slice(1);
  const arch = ARCHETYPES[seed % ARCHETYPES.length];
  const c: Ctx = {
    s, v: s.vertical, audience, subjectCap, cta: s.vertical.cta,
    darkBg: colors[0] ?? DARK[seed % DARK.length],
    lightBg: LIGHT[(seed + 1) % LIGHT.length],
    accent: colors[1] ?? '#4f7cff',
    seed,
  };
  const extra = s.vertical.extra ? s.vertical.extra(s.subject, seed) : [];
  const known = research ? [researchSection(c, research)] : [];

  switch (arch) {
    case 'vitrine': // produto/stock à frente, texto depois
      return [heroSection(c, true), ...extra, benefitsSection(c), ...known, trustSection(c), faqSection(c), formSection(c)];
    case 'autoridade': // problema → método → prova — serviços e consultoria
      return [heroSection(c, false), problemSection(c), ...known, stepsSection(c), trustSection(c), ...extra, faqSection(c), formSection(c), finalCtaSection(c)];
    case 'direta': // a mais curta: hero → benefícios → catálogo → formulário
      return [heroSection(c, false), benefitsSection(c), ...extra, ...known, formSection(c), finalCtaSection(c)];
    default: // clássica AIDA completa
      return [heroSection(c, false), problemSection(c), benefitsSection(c), ...extra, ...known, trustSection(c), faqSection(c), formSection(c), finalCtaSection(c)];
  }
}

/* ─────────── provider ─────────── */

function stripCodeFence(text: string): string {
  return text.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/** Repara JSON cortado a meio (respostas de modelos com limite de tokens). */
function repairTruncatedJson(text: string): string {
  let t = text;
  // Fecha string pendura (número ímpar de aspas não escapadas).
  const quotes = (t.match(/(?<!\\)"/g) ?? []).length;
  if (quotes % 2 === 1) t += '"';
  // Corta vírgulas/dois-pontos soltos no fim e fecha coleções abertas.
  t = t.replace(/[,\s:]+$/, '');
  const opens = (stack: string, close: string) => {
    let depth = 0;
    let inStr = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === stack) depth++;
      else if (ch === close) depth--;
    }
    return depth;
  };
  t += ']'.repeat(opens('[', ']')) + '}'.repeat(opens('{', '}'));
  return t;
}

/** Melhor esforço para extrair JSON de texto devolvido por um LLM. */
export function extractJson(text: string): Record<string, unknown> {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const slice = start >= 0 ? cleaned.slice(start) : cleaned;
    const end = slice.lastIndexOf('}');
    // 1) JSON completo tal como veio.
    if (end > 0) {
      try {
        return JSON.parse(slice.slice(0, end + 1));
      } catch {
        // 2) Reparar aspas/nesting partidos.
        try {
          return JSON.parse(repairTruncatedJson(slice.slice(0, end + 1)));
        } catch {
          // 3) Resgate: cortar no último ponto que fecha uma secção e rematar.
          for (let i = slice.length - 1, cuts = 0; i > 200 && cuts < 80; i = slice.lastIndexOf('}', i - 1), cuts++) {
            if (i < 0) break;
            try {
              return JSON.parse(repairTruncatedJson(slice.slice(0, i + 1)));
            } catch {
              // continuar a recuar
            }
          }
        }
      }
    }
    throw new Error('A resposta da IA não contém JSON válido.');
  }
}

function localRewrite({ instruction, current }: RewriteRequest): string {
  const text = (current || '').trim();
  if (!text) return 'Conteúdo gerado pela IA local. Selecione um elemento com texto ou edite-o no Builder.';
  const lower = instruction.toLowerCase();
  if (/curt|encurt|concis|diret/.test(lower)) {
    const first = text.split(/(?<=[.!?])\s/)[0];
    return first.length > 120 ? first.slice(0, 117) + '…' : first;
  }
  if (/convers|convert|cta|vender|persuas/.test(lower)) {
    return `${text} ${/!$/.test(text) ? '' : 'Dê o primeiro passo agora — é rápido e sem compromisso.'}`.trim();
  }
  if (/formal|profissional|s[eé]rio/.test(lower)) {
    return text.replace(/\b(emos|amos|vam)\b/g, 'amos').replace(/\btu\b/gi, 'o cliente').replace(/\bfixe\b|\bcool\b|\bgiro\b/gi, 'de excelência');
  }
  if (/inform|detalh|expand|mais/.test(lower)) {
    return `${text} Falamos de compromisso, clareza e resultados medidos desde o primeiro dia.`;
  }
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export const localProvider: AiProvider = {
  name: 'local',

  async plan(briefing: PlanBriefing): Promise<AiPlan> {
    const signals = readSignals(briefing);
    const colors = briefing.context?.brandColors?.length ? briefing.context.brandColors : ['#0c1423', '#4f7cff', '#f5f7fb'];
    // Seed do relógio (ou explícita para gerar variantes lado a lado):
    // cada criação do mesmo briefing sai com arquétipo, imagens e paleta
    // diferentes — o utilizador escolhe a que gosta.
    const seed = briefing.seed ?? (Date.now() + (briefing.answers ? Object.keys(briefing.answers).length * 101 : 0)) % 9973;
    const subjectCap = signals.subject.charAt(0).toUpperCase() + signals.subject.slice(1);
    // O agente pesquisa na Internet quando não conhece o assunto (ex.: "quadros
    // pintados à mão"). Quando a vertical é conhecida (carros, ERP, eventos…)
    // a copy já é específica do setor e factos soltos podiam contradizê-la.
    const research = signals.matched ? null : await researchSubject(`${briefing.description} ${answersText(briefing.answers)}`);
    const sections = buildSections(signals, briefing, colors, seed, research);
    return {
      source: 'local',
      name: signals.vertical.id === 'evento' ? subjectCap : `${subjectCap} — Landing Page`,
      objective: briefing.objective,
      audience: briefing.context?.audience ?? 'Clientes que já estão decididos a comprar, só precisam de confiança',
      offer: briefing.context?.offer ?? fillCopy(signals.vertical.heroBody, subjectCap, '').split('.')[0] + '.',
      cta: signals.vertical.cta,
      brandColors: colors,
      visualDirection: `Fotografia real de ${signals.vertical.name.toLowerCase()}, cor de marca dominante, tipografia grande e um único CTA repetido.`,
      visualQueries: [signals.vertical.imagesQuery],
      brandSummary: briefing.context?.brandSummary,
      productSummary: briefing.context?.productSummary ?? ((research ? `${briefing.description.slice(0, 140)} — ${research.title}: ${research.extract.slice(0, 220)}` : briefing.description.slice(0, 140)) || undefined),
      questions: questionsFor(signals, briefing),
      sections: sections.map((s) => ({ ...s, id: nid(), elements: s.elements.map((e) => ({ id: nid(), type: e.type as BuilderElement['type'], content: e.content })) })),
    };
  },

  async rewrite(request: RewriteRequest): Promise<string> {
    return localRewrite(request);
  },

  async section(request: SectionRequest) {
    const lower = norm(request.description);
    if (/pre[cç]o|planos|packages|valor/.test(lower)) {
      return stamp({
        type: 'pricing', title: 'Planos', style: { background: '#f5f7fb' },
        elements: [{ type: 'pricing', content: { plans: [
          { name: 'Essencial', price: '€99', features: ['O necessário para começar'], cta: 'Escolher' },
          { name: 'Profissional', price: '€249', features: ['Tudo do Essencial', 'Suporte prioritário'], cta: 'Escolher' },
          { name: 'Empresarial', price: 'Sob consulta', features: ['Tudo do Profissional', 'Gestor de conta'], cta: 'Falar connosco' },
        ] } }],
      });
    }
    if (/faq|pergunta|duvida/.test(lower)) {
      return stamp({
        type: 'faq', title: 'Perguntas frequentes', style: { background: '#ffffff' },
        elements: [{ type: 'faq', content: { items: [
          { q: 'Como funciona?', a: 'De forma simples: fale connosco, receba proposta, decida sem pressão.' },
          { q: 'Quanto tempo demora?', a: 'O suficiente para valer a pena — o menos possível para o resto.' },
        ] } }],
      });
    }
    if (/galeria|fotos|fotos|imagens|portf[oó]lio/.test(lower)) {
      return stamp({
        type: 'gallery', title: 'Galeria', style: { background: '#0c1423', accent: '#4f7cff' },
        elements: [{ type: 'gallery', content: { images: [1, 2, 3, 4].map((i) => ({ url: pickImage('negocio produto', [], i + 5), alt: `Trabalho ${i}` })) } }],
      });
    }
    if (/equipa|team|pessoas|quem/.test(lower)) {
      return stamp({
        type: 'about', title: 'Sobre', style: { background: '#ffffff' },
        elements: [
          { type: 'image', content: { url: pickImage('equipa empresa', [], 2), alt: 'A equipa' } },
          { type: 'text', content: { text: 'Quem somos', level: 'title' } },
          { type: 'text', content: { text: 'Conte aqui a história da empresa — o que fez, porque faz, e quem fica responsável quando algo corre mal.', level: 'body' } },
        ],
      });
    }
    if (/marcar|agenda|reunio|calend/.test(lower)) {
      return stamp({
        type: 'scheduling', title: 'Marcar', style: { background: '#f5f7fb' },
        elements: [{ type: 'scheduling', content: { title: 'Marcar reunião', submit: 'Confirmar', success: 'Ficou agendado. Recebe confirmação por email.' } }],
      });
    }
    if (/depoimentos|testemunh|reviews|clientes/.test(lower)) {
      return stamp({
        type: 'testimonials', title: 'Depoimentos', style: { background: '#ffffff' },
        elements: [{ type: 'testimonials', content: { items: [
          { name: 'Nome', role: 'O que compraram', text: 'Testemunho real e específico, com o problema resolvido.' },
          { name: 'Nome', role: 'O que compraram', text: 'Substitua por frases verdadeiras de clientes seus.' },
        ] } }],
      });
    }
    return stamp({
      type: 'benefits', title: 'Nova secção', style: { background: '#f5f7fb' },
      elements: [
        { type: 'text', content: { text: request.description.slice(0, 80) || 'Benefícios', level: 'title' } },
        { type: 'text', content: { text: 'Uma promessa concreta, um motivo para confiar, e o que o visitante ganha em agir agora.', level: 'body' } },
      ],
    });
  },

  async image(request: ImageRequest): Promise<ImageChoice> {
    const seed = Math.floor(Math.random() * 1000);
    const query = `${request.instruction} ${request.context?.productSummary ?? ''} ${request.context?.visualQueries?.join(' ') ?? ''}`;
    return { url: pickImage(query, request.exclude ?? [], seed), alt: request.instruction.slice(0, 120), source: 'local' };
  },
};
