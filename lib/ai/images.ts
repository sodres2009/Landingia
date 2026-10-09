/**
 * Pesquisa de imagens do agente.
 * Estratégia em dois níveis:
 * 1. Pexels API (chave PEXELS_API_KEY) — fotografia real com curadoria.
 * 2. Catálogo curado por tema (Unsplash) — rede de segurança sem chave.
 * O LoremFlickr foi removido por completo: era um pool aleatório do Flickr.
 */

import { pexelsSearch } from './pexels';

interface ImagePool {
  keywords: RegExp;
  photos: string[];
}

const CATALOG: ImagePool[] = [
  {
    keywords: /carros?|automov|viatura|stand\b|seminov|motas?|oficina|conduz|estrada/i,
    photos: [
      'photo-1503376780353-7e6692767b70', // desportivo em estrada
      'photo-1494976388531-d1058494cdd8', // Mustang clássico
      'photo-1552519507-da3b142c6e3d',    // carro prateado
      'photo-1583121274602-3e2820c69888', // desportivo escuro
      'photo-1568605114967-6877f6fbb38b', // carro moderno
    ],
  },
  {
    keywords: /imove|casas?|apartamento|moradia|habita|arrendamento|quartos?|t[0-3]\b|imobili/i,
    photos: [
      'photo-1560448204-e02f11c3d0e2', // sala de apartamento
      'photo-1512917774080-9991f1c4c750', // moradia moderna
      'photo-1600585154340-be6161a56a0c', // fachada de casa
      'photo-1600607687939-ce8a6c25118c', // interior claro
      'photo-1613490493576-7fde63acd811', // villa com piscina
    ],
  },
  {
    keywords: /restaurante|comida|gastronom|chef|menu|pizza|sushi|marisco|caf[eé]|petisco|jantar|cozinha/i,
    photos: [
      'photo-1517248135467-4c7edcad34c4', // interior de restaurante
      'photo-1414235077428-338989a2e8c0', // fine dining
      'photo-1504674900247-0877df9cc836', // prato empratado
      'photo-1540189549337-e28fa8b5a4fa', // comida com carácter
    ],
  },
  {
    keywords: /moda|roupas?|vestuar|textil|calcad|acessorios|estilo|coleca/i,
    photos: [
      'photo-1483985988355-763728e1935b', // montras de rua
      'photo-1490481651871-ab68de25d43d', // editorial de moda
      'photo-1469334031218-e382a71b716b', // cabide de peças
      'photo-1441984904996-e0b6ba687e04', // loja de roupa
    ],
  },
  {
    keywords: /gimnas|ginasio|fitness|treinos?|crossfit|yoga|desporto|trainer|saude física/i,
    photos: [
      'photo-1517836357463-d25dfeac3438', // pesos de ginásio
      'photo-1571019613454-1cb2f99b2d8b', // treino funcional
      'photo-1571902943202-507ec2618e8e', // ginásio escuro
    ],
  },
  {
    keywords: /viagens?|travel|tour|f[eé]rias|hotel|resort|excursa|destinos?|paisagem/i,
    photos: [
      'photo-1488646953014-85cb44e25828', // mapa e câmara
      'photo-1469854523086-cc02fe5d8800', // estrada de viagem
      'photo-1507525428034-b72313b1b68e', // praia de destino
      'photo-1476514525535-07fb3b4ae5f1', // lago e montanha
    ],
  },
  {
    keywords: /cursos?|formac|escola|educa|aulas?|masterclass|academia|alunos?|estudante/i,
    photos: [
      'photo-1523050854058-8df90110c9f1', // campus universitário
      'photo-1509062522246-3755977927d7', // sala de aula
      'photo-1522202176988-66273c2fd55f', // estudantes a trabalhar
      'photo-1524178232363-1fb2b075b655', // auditório de formação
    ],
  },
  {
    keywords: /clinica|saude|dentista|medic|fisioterapia|bem-?estar|terapia|cuidados/i,
    photos: [
      'photo-1576091160399-112ba8d2588f', // profissional de saúde
      'photo-1579684385127-1ef15d508118', // consultório
    ],
  },
  {
    keywords: /evento|confer|palestra|audit|plateia|network|encontro|workshop|semin/i,
    photos: [
      'photo-1540575467063-178a50c2df87', // conferência, auditório cheio
      'photo-1515169067868-5387ec356754', // plateia e palco
      'photo-1505373877841-8d25f7d46678', // keynote em palco
      'photo-1511578312907-e13cbde1a617', // painel de oradores
      'photo-1560264280-88b68371db98',    // sala de conferências moderna
    ],
  },
  {
    keywords: /ia\b|intelig|tecnolog|software|digital|dados|robo|automatiz|app\b|plataforma|saas/i,
    photos: [
      'photo-1518770660439-4636190af475', // circuito/tecnologia
      'photo-1485827404703-89b55fcc595e', // robótica
      'photo-1531746790731-6c087fecd65a', // abstração digital
      'photo-1550751827-4bd374c3f58b',    // dados e ecrãs
      'photo-1451187580459-43490279c0fa', // globo conectado
    ],
  },
  {
    keywords: /equipa|team|reuni|escritor?io|empresa|negocio|business|corporativ|limpez|mudanca|faxina|mantenimento|servicos? gerais|contabil|consultor|advogad/i,
    photos: [
      'photo-1556761175-b413da4baf72', // equipa em reunião
      'photo-1521737711867-e3b97375f902', // equipa em colaboração
      'photo-1517048676732-d65bc937f952', // grupo de colegas
      'photo-1497366754035-f200968a6e72', // escritório moderno
      'photo-1497366811353-6870744d04b2', // sala de reuniões
    ],
  },
  {
    keywords: /produto|loja|ecommerce|venda|packaging|retail|comercio/i,
    photos: [
      'photo-1441986300917-64674bd600d8', // loja
      'photo-1556742049-0cfed4f6a45d',    // pagamento/produto
      'photo-1472851294608-062f824d29cc', // compra
      'photo-1523206489230-c012c64b2b48', // detalhe de produto
      'photo-1566576912321-d58dc7bc7957', // vitrine
    ],
  },
];

const FALLBACK = CATALOG[10].photos;

function url(photo: string): string {
  return `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1600&q=85`;
}

/**
 * Palavras-chave para o Flickr. O Flickr pesquisa em inglês e aceita OR,
 * por isso: remove stop-words PT, traduz os termos mais comuns e devolve
 * no máximo 2 tags — pesquisa streta evita resultados aleatórios.
 */
const STOP = new Set(['landing', 'pagina', 'page', 'quero', 'preciso', 'gostaria', 'para', 'com', 'uma', 'um', 'uns', 'umas', 'meu', 'minha', 'site', 'criar', 'fazer', 'pago', 'negocio', 'empresa', 'cliente', 'pessoas', 'desta', 'deste', 'tipo', 'online', 'internet', 'muito', 'mais', 'como', 'this', 'that', 'with', 'from']);
const PT_EN: Record<string, string> = {
  carros: 'car', carro: 'car', viaturas: 'car', viatura: 'car', automovel: 'car', oficina: 'garage',
  casas: 'house', casa: 'house', apartamento: 'apartment', moradia: 'house', quartos: 'room', quarto: 'room',
  cozinha: 'kitchen', casa2: 'home', comida: 'food', prato: 'food', restaurante: 'restaurant',
  roupas: 'fashion', roupa: 'fashion', loja: 'shop', vendas: 'retail', venda: 'retail', produto: 'product',
  produtos: 'product', equipa: 'team', equipe: 'team', reunioes: 'meeting', reuniao: 'meeting',
  escola: 'school', cursos: 'course', curso: 'course', aulas: 'class', aula: 'class', alunos: 'students',
  clinica: 'clinic', saude: 'health', dentista: 'dentist', medicos: 'doctor', medico: 'doctor',
  eventos: 'event', evento: 'event', conferencia: 'conference', festa: 'party', festival: 'festival',
  viagem: 'travel', viagens: 'travel', ferias: 'vacation', hotel: 'hotel', praia: 'beach',
  jardim: 'garden', plantas: 'plant', plant: 'plant', animais: 'dog', animais2: 'dog', animal: 'dog', caes: 'dog', cao: 'dog',
  bebidas: 'drink', cafe: 'coffee', vinhos: 'wine', vinho: 'wine',
  tecnologia: 'technology', software: 'software', aplicacao: 'app', aplicacoes: 'app', app: 'app',
  marketing: 'marketing', design: 'design', construcao: 'construction', obras: 'construction',
  limpeza: 'cleaning', limpeza2: 'clean', limpo: 'clean', servicos: 'service', servico: 'service',
 industria: 'industry', fabrica: 'factory', armazem: 'warehouse', desporto: 'sport', treino: 'gym',
  musica: 'music', musica2: 'music', fotografia: 'photography', fotos: 'photo', foto: 'photo',
  cabelo: 'hair', barbearia: 'barber', beleza: 'beauty', estetica: 'beauty', unhas: 'nails',
  pets: 'pet', veterinario: 'veterinary',
};

function slugWords(query: string, max = 2): string[] {
  const words = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const en: string[] = [];
  for (const w of words) {
    const t = PT_EN[w] ?? w;
    if (!en.includes(t)) en.push(t);
    if (en.length >= max) break;
  }
  return en;
}

export interface PickedPhoto {
  url: string;
  alt: string;
  source: 'pexels' | 'curated';
}

/** Escolha curada pura (sem rede): catálogo por tema, fallback genérico. */
function curatedPhoto(query: string, exclude: string[] = [], seed = 0): string {
  const pool = poolFor(query);
  if (!pool) return fallbackImage(seed);
  const available = pool.photos.filter((p) => !exclude.includes(url(p)));
  const list = available.length ? available : pool.photos;
  return url(list[Math.abs(seed) % list.length]);
}

/**
 * Pesquisa com tags EM INGLÊS decididas pelo agente: primeiro Pexels
 * (fotografia real com curadoria), depois o catálogo curado.
 * O LoremFlickr foi eliminado — devolvia fotos aleatórias do Flickr.
 */
export async function pickByTags(tags: string[], exclude: string[] = [], seed = 0): Promise<PickedPhoto> {
  const clean = tags
    .map((t) => t.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' '))
    .filter((t) => t.length > 1)
    .slice(0, 3);
  const query = clean.join(' ');
  const found = await pexelsSearch(query || 'business meeting', 8);
  if (found.length) {
    const picked = found.find((p) => !exclude.includes(p.url)) ?? found[Math.abs(seed) % found.length];
    return { url: picked.url, alt: picked.alt, source: 'pexels' };
  }
  return { url: curatedPhoto(query, exclude, seed), alt: '', source: 'curated' };
}

/**
 * Escolha de imagem para o SERVIDOR: Pexels primeiro (query em inglês a
 * partir do texto/descrição), catálogo curado como rede de segurança.
 */
export async function pickPhoto(query: string, exclude: string[] = [], seed = 0): Promise<PickedPhoto> {
  const en = slugWords(query, 4).join(' ');
  const found = await pexelsSearch(en || query, 8);
  if (found.length) {
    const picked = found.find((p) => !exclude.includes(p.url)) ?? found[Math.abs(seed) % found.length];
    return { url: picked.url, alt: picked.alt, source: 'pexels' };
  }
  return { url: curatedPhoto(query, exclude, seed), alt: '', source: 'curated' };
}

function poolFor(query: string): ImagePool | undefined {
  return CATALOG.find((c) => c.keywords.test(query));
}

/**
 * Escolha síncrona e segura no browser: catálogo curado apenas.
 * (A pesquisa Pexels exige chave e corre só no servidor — pickPhoto.)
 */
export function pickImage(query: string, exclude: string[] = [], seed = 0): string {
  return curatedPhoto(query, exclude, seed);
}

/** Todas as imagens do tema (útil para o agente mostrar variantes). */
export function imageCandidates(query: string): string[] {
  const pool = poolFor(query);
  return pool ? pool.photos.map(url) : FALLBACK.map(url);
}

/** Imagem genérica quando nenhum tema corresponde. */
export function fallbackImage(seed = 0): string {
  return url(FALLBACK[Math.abs(seed) % FALLBACK.length]);
}

/**
 * Pistas por papel da secção — a foto certa depende da função do bloco:
 * hero mostra pessoas a viver o benefício, benefícios mostra o trabalho,
 * prova social mostra pessoas, CTA/formulário mostra atendimento.
 */
const ROLE_HINTS: Record<string, string> = {
  hero: 'happy lifestyle people',
  benefits: 'work service team action',
  problem: 'work service team action',
  social: 'people smiling trust hands',
  proof: 'people smiling trust hands',
  cta: 'office desk handshake meeting',
  form: 'office desk meeting laptop',
};

/** Escolha de imagem com papel: Pexels com pistas do papel + catálogo. */
export async function pickImageForRole(query: string, role: string, exclude: string[] = [], seed = 0): Promise<PickedPhoto> {
  const hint = ROLE_HINTS[role] ?? '';
  const photo = await pickPhoto(`${query} ${hint}`.trim(), exclude, seed);
  if (photo.source === 'pexels') return photo;
  // Sem Pexels: catálogo curado primeiro com a query original, papel depois.
  const pool = poolFor(query);
  if (pool) return { url: curatedPhoto(query, exclude, seed), alt: '', source: 'curated' };
  return photo;
}
