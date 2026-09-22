/* Auditoria de todas as ações do agente + leads + bookings no BASE dado. */
const BASE = process.env.BASE || 'http://localhost:3005';
const post = async (path, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const log = (...a) => console.log(...a);

log('=== BASE', BASE, '===');

// 1. plan
const plan = (await post('/api/ai', { action: 'plan', description: 'ginásio boutique no Porto com treino personalizado', objective: 'Captar leads', style: 'Criativo' })).data;
log('plan: seccoes=' + (plan.sections?.length ?? 0) + ' source=' + plan.source + ' cta=' + plan.cta);

// 2. rewrite (o agente reescreve um texto existente)
const rw = await post('/api/ai', { action: 'rewrite', instruction: 'mais direta e com número', current: 'Temos os melhores treinos personalizados da cidade.', context: { audience: 'profissionais dos 30-45 anos', cta: plan.cta } });
log('rewrite: http=' + rw.status + ' source=' + rw.data.source + ' texto=' + JSON.stringify(String(rw.data.text ?? rw.data.error ?? '').slice(0, 80)));

// 3. section (o agente cria uma secção nova)
const sec = await post('/api/ai', { action: 'section', description: 'secção de horários do ginásio', objective: 'Captar leads', context: { cta: plan.cta } });
log('section: http=' + sec.status + ' type=' + sec.data.section?.type + ' elementos=' + (sec.data.section?.elements?.length ?? 0) + ' erro=' + (sec.data.error ?? 'nenhum'));

// 4. ciclo de publicação + lead + leitura
const slug = 'audit-' + Date.now().toString(36);
const pub = await post('/api/publish', { action: 'publish', slug, page: { id: slug, name: 'Audit', status: 'published', aiContext: { cta: plan.cta }, sections: plan.sections } });
const formSec = (plan.sections ?? []).find((s) => (s.elements ?? []).some((e) => e.type === 'form'));
const formEl = formSec?.elements?.find((e) => e.type === 'form');
const lead = await post('/api/publish', { action: 'lead', slug, sectionId: formSec?.id ?? '', elementId: formEl?.id ?? '', values: { nome: 'Ana Audit', email: 'ana@audit.pt' } });
const pubPage = await (await fetch(`${BASE}/p/${slug}`, { signal: AbortSignal.timeout(30000) })).text();
log('publicar: ok=' + pub.data?.ok + ' lead: http=' + lead.status + ' url: ' + pubPage.length + ' bytes sem-erro=' + !pubPage.includes('Application error'));

// 5. validação de erros (a API não rebenta com input mau)
const bad1 = await post('/api/ai', { action: 'plan' });
const bad2 = await post('/api/ai', { action: 'nao-existe' });
const bad3 = await post('/api/publish', { action: 'lead', slug: 'NAO/EXISTE', values: {} });
log('validação: sem-descricao=' + bad1.status + ' ação-invalida=' + bad2.status + ' slug-mau=' + bad3.status + ' (esperado 400,400,400)');

// 6. limpar
await post('/api/publish', { action: 'unpublish', slug });
log('limpeza feita');
