/* E2E final: plano rich → publicar → API serve blocos novos + bundle publicado contém o renderizador. */
const API = 'https://app-d76b73421919.factorai.cloud';
const WEB = 'https://app-ed93ae2db29d.factorai.cloud';

const r = await fetch(`${API}/agent/plan`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Plataforma SaaS de gestão para clínicas veterinárias com 8 módulos: agenda, fichas clínicas, stock, faturação, telemedicina, lembretes por SMS, relatórios e portal do dono. Objetivo: marcações de demonstração. Sem preços publicados.',
    objective: 'Marcar demonstrações', style: 'Moderno', depth: 'rich',
  }),
  signal: AbortSignal.timeout(300000),
});
if (!r.ok) { console.log('plan HTTP', r.status); process.exit(1); }
const plan = (await r.json()).plans[0].plan;
const slug = 'e2e-ref-' + Date.now().toString(36);
const page = {
  id: slug, name: plan.name, status: 'published', slug,
  objective: plan.objective, aiContext: { productSummary: plan.productSummary, cta: plan.cta },
  theme: plan.theme ?? undefined, sections: plan.sections,
};
const pub = await fetch(`${API}/publish`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug, page }), signal: AbortSignal.timeout(60000),
});
console.log('publicado:', pub.ok, `→ ${WEB}/p/${slug}`);

// 1) A API serve os blocos novos para a página publicada.
const served = (await (await fetch(`${API}/published/${slug}`, { signal: AbortSignal.timeout(60000) })).json()).page;
const els = (served.sections ?? []).flatMap((s) => s.elements);
const data = {
  'ícones em cartões de texto': els.some((e) => e.type === 'text' && e.content?.icon),
  'captions nos cartões': els.some((e) => e.type === 'text' && e.content?.caption),
  'footer presente': els.some((e) => e.type === 'footer'),
  'demo com cenário clicável (q)': els.some((e) => e.type === 'demo' && (e.content?.items ?? []).some((i) => i.q)),
};
// 2) O bundle publicado contém o renderizador dos blocos novos.
const html = await (await fetch(`${WEB}/p/${slug}`, { signal: AbortSignal.timeout(90000) })).text();
const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
const bundles = await Promise.all(srcs.map((s) => fetch(s.startsWith('http') ? s : WEB + s).then((x) => x.text()).catch(() => '')));
const js = bundles.join('');
const bundle = {
  'render footer no bundle': js.includes('lp-footer-col'),
  'chips «Experimente pedir» no bundle': js.includes('Experimente pedir'),
  'ícones SVG no bundle': js.includes('lp-el-icon'),
  'chart no bundle': js.includes('lp-chart-row'),
};
for (const [k, ok] of Object.entries({ ...data, ...bundle })) console.log(ok ? `✓ ${k}` : `✗ ${k}`);
console.log(Object.values({ ...data, ...bundle }).every(Boolean) ? '✓✓ E2E NÍVEL REFERÊNCIA OK' : '⚠ verificar acima (modelo pode ter omitido blocos — repetir)');
