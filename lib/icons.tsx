/**
 * Ícones SVG inline (stroke, estilo lucide) — zero dependências.
 * O agente escolhe por nome de um vocabulário fechado; resolveIcon aceita
 * nome exato, keyword PT/EN ou emoji e nunca devolve ícone partido.
 */
import type { CSSProperties } from 'react';

export const ICON_NAMES = [
  'zap', 'shield', 'chart', 'users', 'calendar', 'clock', 'mail', 'phone', 'pin', 'star',
  'box', 'truck', 'building', 'home', 'heart', 'code', 'rocket', 'search', 'check', 'x',
  'dollar', 'credit', 'wallet', 'briefcase', 'award', 'target', 'globe', 'link', 'lock', 'eye',
  'message', 'bell', 'camera', 'image', 'music', 'coffee', 'utensils', 'leaf', 'droplet', 'sun',
  'book', 'graduation', 'clipboard', 'gear', 'headset', 'sparkles', 'trending', 'layers',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Traçados 24×24, stroke 1.8, currentColor (path data do lucide, curados à mão). */
const PATHS: Record<IconName, string[]> = {
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  chart: ['M3 3v18h18', 'M7 15l3-4 3 3 5-7'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-10 6L2 7'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
  pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  star: ['M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z'],
  box: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
  truck: ['M14 18V6a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2', 'M14 9h4l4 4v4a1 1 0 0 1-1 1h-2', 'M9 18h6', 'M6 18h2', 'M7 18a2 2 0 1 0 0 0z', 'M17 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0z', 'M7 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0z'],
  building: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4'],
  home: ['m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  rocket: ['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z', 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z', 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0', 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.35-4.35'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  dollar: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  credit: ['M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M2 11h20'],
  wallet: ['M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2', 'M16 12H3l3-4 3 4h13v4h-3', 'M17 12a1 1 0 0 0 0 2h.01'],
  briefcase: ['M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16', 'M2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z'],
  award: ['M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm8.21 13.89-1.72 7.68 5.51-3.25 5.51 3.25-1.72-7.68'],
  target: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'm21 15-5-5L5 21'],
  music: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  coffee: ['M17 8h1a4 4 0 1 1 0 8h-1', 'M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z', 'M6 2v2', 'M10 2v2', 'M14 2v2'],
  utensils: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7'],
  leaf: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'],
  droplet: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 1v2', 'M12 21v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M1 12h2', 'M21 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  graduation: ['M22 10 12 5 2 10l10 5 10-5z', 'M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5'],
  clipboard: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  headset: ['M3 14v-3a9 9 0 0 1 18 0v3', 'M21 19a2 2 0 0 1-2 2h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a2 2 0 0 1 2 2z', 'M3 19a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2z'],
  sparkles: ['m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z'],
  trending: ['m22 7-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  layers: ['m12 2 8.5 4.5L12 11 3.5 6.5z', 'm3.5 12 8.5 4.5 8.5-4.5', 'm3.5 17 8.5 4.5 8.5-4.5'],
};

/** Keywords PT/EN → nome. A primeira coluna vence. */
const KEYWORDS: [IconName, string[]][] = [
  ['zap', ['rápid', 'rapid', 'veloc', 'energia', 'potente', 'instant', '⚡']],
  ['shield', ['segur', 'seguranca', 'proteca', 'confianca', 'gdpr', 'privacidade', 'garantia', '🛡']],
  ['chart', ['gráfico', 'grafico', 'numero', 'dados', 'analitic', 'dashboard', 'performance', '📊']],
  ['users', ['equipa', 'equipe', 'clientes', 'pessoas', 'comunidade', 'utilizadores', '👥']],
  ['calendar', ['agenda', 'marcacao', 'reserva', 'calendario', 'prazo', 'data', '📅']],
  ['clock', ['tempo', 'hora', 'prazo', '24h', 'urgente', '⏰']],
  ['mail', ['email', 'mail', 'newsletter', 'contacto', '✉']],
  ['phone', ['telefone', 'telemovel', 'chamada', 'whatsapp', '📞']],
  ['pin', ['local', 'localizacao', 'morada', 'mapa', 'proximo', '📍']],
  ['star', ['estrela', 'avaliacao', 'top', 'qualidade', 'nota', '⭐']],
  ['box', ['produto', 'stock', 'entrega', 'embalagem', 'encaixe', '📦']],
  ['truck', ['entrega', 'logistica', 'envio', 'transporte', 'obras', '🚚']],
  ['building', ['empresa', 'escritorio', 'instituicao', 'imobiliario', '🏢']],
  ['home', ['casa', 'lar', 'habitat', 'espaco', '🏠']],
  ['heart', ['saude', 'cuidado', 'amor', 'bem-estar', 'carinho', '❤']],
  ['code', ['codigo', 'dev', 'software', 'api', 'tecnologia', '💻']],
  ['rocket', ['lancar', 'arranque', 'acelerar', 'crescer', 'start', '🚀']],
  ['search', ['procura', 'pesquisa', 'encontrar', 'seo', '🔍']],
  ['check', ['simples', 'facil', 'confirmado', 'aprovado', 'sem', '✓']],
  ['dollar', ['preco', 'euro', 'custo', 'poupanca', 'investimento', 'pagamento', '💶']],
  ['credit', ['cartao', 'pagamento', 'checkout', 'fatura', '💳']],
  ['wallet', ['renda', 'receita', 'faturacao', 'cobranca', 'carteira']],
  ['briefcase', ['negocio', 'profissional', 'corporate', 'trabalho', '💼']],
  ['award', ['premio', 'certificado', 'reconhecimento', 'elite', '🏆']],
  ['target', ['foco', 'objetivo', 'meta', 'resultado', 'conversao', '🎯']],
  ['globe', ['online', 'global', 'web', 'internet', 'mundial', '🌍']],
  ['link', ['integracao', 'conexao', 'liga', 'api', 'plataforma']],
  ['lock', ['seguro', 'bloqueado', 'acesso', 'confidencial', '🔒']],
  ['eye', ['visivel', 'transparencia', 'visual', 'preview', '👁']],
  ['message', ['chat', 'mensagem', 'suporte', 'falar', 'comunicacao', '💬']],
  ['bell', ['alerta', 'notificacao', 'lembrete', 'aviso', '🔔']],
  ['camera', ['foto', 'imagem', 'video', 'visual', '📷']],
  ['image', ['galeria', 'portfolio', 'foto']],
  ['music', ['som', 'audio', 'musica', 'evento', 'festa', '🎵']],
  ['coffee', ['cafe', 'restauracao', 'pausa', 'convivio', '☕']],
  ['utensils', ['comida', 'prato', 'restaurante', 'menu', 'gastronomia', 'marisco', '🍴']],
  ['leaf', ['natural', 'organico', 'eco', 'sustentavel', 'planta', 'jardim', '🌿']],
  ['droplet', ['agua', 'limpeza', 'hidratacao', 'piscina', 'molhado', '💧']],
  ['sun', ['sol', 'verao', 'claro', 'brilho', '☀']],
  ['book', ['curso', 'formacao', 'aprender', 'guia', 'conhecimento', '📚']],
  ['graduation', ['escola', 'licao', 'mestre', 'estudante', 'certificacao', '🎓']],
  ['clipboard', ['checklist', 'processo', 'metodo', 'plano', 'etapa', '📋']],
  ['gear', ['config', 'setup', 'automacao', 'mecanico', 'funciona', '⚙']],
  ['headset', ['apoio', 'assistencia', 'atendimento', 'help', 'suporte', '🎧']],
  ['sparkles', ['ia', 'magia', 'especial', 'novo', 'premium', 'brilho', '✨']],
  ['trending', ['crescer', 'subir', 'evolucao', 'melhoria', 'sucesso', '📈']],
  ['layers', ['modulo', 'camada', 'completo', 'sistema', 'estrutura', 'stack']],
];

const FALLBACKS: IconName[] = ['sparkles', 'check', 'target', 'zap', 'star', 'trending'];

/** Nome exato → keyword/emoji → fallback determinístico (nunca ícone partido). */
export function resolveIcon(raw: unknown): IconName | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const direct = s.replace(/[^a-z]/g, '') as IconName;
  if (direct && direct in PATHS) return direct;
  for (const [name, words] of KEYWORDS) {
    if (words.some((w) => s.includes(w))) return name;
  }
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return FALLBACKS[h % FALLBACKS.length];
}

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style}>
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
