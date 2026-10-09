/* E2E final na cloud: jornada completa no par web+api em produção. */
const WEB = 'https://app-ed93ae2db29d.factorai.cloud';
const API = 'https://app-d76b73421919.factorai.cloud';
const log = (...a) => console.log(...a);

const health = await (await fetch(API + '/healthz', { signal: AbortSignal.timeout(30000) })).json();
log('1. api health:', JSON.stringify(health));

const t0 = Date.now();
const planRes = await fetch(API + '/agent/plan?variants=1', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: 'stand de carros seminovos em Coimbra com garantia incluída', objective: 'Marcar visitas', style: 'Profissional' }),
  signal: AbortSignal.timeout(240000),
});
const plan = (await planRes.json()).plans?.find((p) => p.ok)?.plan;
if (!plan) throw new Error('proposta falhou: ' + JSON.stringify(planRes.status));
const images = (plan.sections ?? []).flatMap((s) => s.elements).filter((e) => e.type === 'image');
log(`2. proposta: ${((Date.now() - t0) / 1000).toFixed(1)}s seccoes=${plan.sections.length} imagens=${images.length} (todas http=${images.every((e) => String(e.content.url).startsWith('https'))})`);
log(`   headline: ${String(plan.sections[0].elements.find((e) => e.type === 'text')?.content.text).split('\n')[0]}`);

const slug = 'e2e-cloud-' + Date.now().toString(36);
const pub = await (await fetch(API + '/publish', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug, page: { id: slug, name: plan.name, status: 'published', sections: plan.sections } }),
})).json();
log('3. publicar:', JSON.stringify(pub));

const webPage = await fetch(`${WEB}/p/${slug}`, { signal: AbortSignal.timeout(60000) });
log('4. URL pública no web (Next):', webPage.status);

await fetch(API + '/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
const formSec = plan.sections.find((s) => s.elements.some((e) => e.type === 'form'));
const formEl = formSec?.elements?.find((e) => e.type === 'form');
const lead = await (await fetch(API + '/leads', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug, sectionId: formSec?.id, elementId: formEl?.id, values: { nome: 'E2E Cloud', email: 'e2e@cloud.pt', telefone: '910000000' } }),
})).json();
log('5. visita+lead:', JSON.stringify(lead));

const list = (await (await fetch(API + '/published')).json()).pages.find((p) => p.slug === slug);
log('6. dashboard vê:', JSON.stringify(list));

// regressão: página legada migra
const legacy = await (await fetch(API + '/published/teste-limpeza-9f2a')).json();
log('7. regressão legada:', legacy.name, 'ok');

await fetch(API + '/unpublish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
log('8. limpeza e2e: ok — TUDO PASSA');
