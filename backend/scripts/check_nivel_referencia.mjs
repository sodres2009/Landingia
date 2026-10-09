/* E2E nível referência: plano rich de SaaS → ícones nos cartões, footer, demo clicável. */
const BASE = 'https://app-d76b73421919.factorai.cloud';
const r = await fetch(`${BASE}/agent/plan`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Plataforma SaaS de gestão para clínicas veterinárias com 8 módulos: agenda, fichas clínicas, stock, faturação, telemedicina, lembretes por SMS, relatórios e portal do dono. Objetivo: marcações de demonstração. Sem preços publicados.',
    objective: 'Marcar demonstrações', style: 'Moderno', depth: 'rich',
  }),
  signal: AbortSignal.timeout(300000),
});
if (!r.ok) { console.log('HTTP', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
const plan = (await r.json()).plans[0].plan;
const els = plan.sections.flatMap((s) => s.elements);
const types = els.map((e) => e.type);
const texts = els.filter((e) => e.type === 'text');
const withIcon = texts.filter((e) => e.content.icon);
const withCaption = texts.filter((e) => e.content.caption);
const demoQ = els.filter((e) => e.type === 'demo').flatMap((e) => (e.content.items ?? [])).filter((i) => i.q);
console.log('secções:', plan.sections.length, '| elementos:', els.length);
console.log('cartões com ícone:', withIcon.length, '/', texts.length, '| com caption:', withCaption.length);
console.log('footer:', types.includes('footer') ? 'SIM' : 'NÃO', '| chart:', types.includes('chart') ? 'SIM' : 'não (sem números reais — correto)', '| demo com q clicável:', demoQ.length);
const vocab = new Set(['zap','shield','chart','users','calendar','clock','mail','phone','pin','star','box','truck','building','home','heart','code','rocket','search','check','x','dollar','credit','wallet','briefcase','award','target','globe','link','lock','eye','message','bell','camera','image','music','coffee','utensils','leaf','droplet','sun','book','graduation','clipboard','gear','headset','sparkles','trending','layers']);
const fora = withIcon.map((e) => e.content.icon).filter((i) => !vocab.has(String(i).toLowerCase()));
console.log(fora.length === 0 ? '✓ ícones todos dentro do vocabulário' : `✗ fora do vocabulário: ${[...new Set(fora)].join(', ')}`);
console.log(withIcon.length >= 4 && types.includes('footer') ? '✓✓ NÍVEL REFERÊNCIA OK' : '⚠ verificar acima');
