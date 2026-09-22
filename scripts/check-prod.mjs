// Verifica o site público publicado: menu sem módulos fake + proposta real com layouts.
const BASE = process.env.BASE ?? 'https://app-ed93ae2db29d.factorai.cloud';
const log = (...a) => console.log(...a);

const html = await (await fetch(BASE + '/', { signal: AbortSignal.timeout(40000) })).text();
const removed = ['A/B Testing', 'Equipa', 'Segurança', 'Integrações', 'Performance'].filter((w) => html.includes(w));
const kept = ['Leads', 'Agendamento', 'Analytics'].filter((w) => html.includes(w));
log(`menu: fake-ainda-visiveis=${removed.join('|') || 'nenhum'} | reais=${kept.join(',')}`);

const t0 = Date.now();
const plan = await (await fetch(BASE + '/api/ai', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'plan', description: 'clínica dentária em Leiria com implantes', objective: 'Marcar reuniões', style: 'Elegante' }),
  signal: AbortSignal.timeout(180000),
})).json();
const secs = plan.sections ?? [];
log(`plano: source=${plan.source} seccoes=${secs.length} ${(Date.now() - t0) / 1000}s nome=${plan.name}`);
log('layouts: ' + secs.map((s) => s.style?.layout ?? 'stack').join(','));
const hero = secs.find((s) => s.type === 'hero');
log('headline: ' + String(hero?.elements?.find((e) => e.type === 'text')?.content?.text ?? '').split('\n')[0]);
const badYears = [...new Set(JSON.stringify(plan).match(/20(1\d|2[0-5])/g) ?? [])];
log('anos-errados=' + (badYears.join('|') || 'nenhum'));
const imgs = secs.flatMap((s) => s.elements).filter((e) => e.type === 'image' || e.type === 'gallery').length;
log('imagens-nos-slots=' + imgs);
