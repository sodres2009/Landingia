/* Verifica o ciclo novo: visita conta, listagem traz visitas+leads, mode=leads devolve os leads. */
const BASE = process.env.BASE || 'http://localhost:3005';
const j = async (r) => r.json();
const log = (...a) => console.log(...a);

const slug = 'debug-' + Date.now().toString(36);
const sections = [{ id: 's1', type: 'hero', title: 'Hero', elements: [{ id: 'e1', type: 'text', content: { text: 'Olá', level: 'heading' } }] },
  { id: 's2', type: 'form', title: 'Form', elements: [{ id: 'e2', type: 'form', content: { title: 'Fala connosco', fields: [{ label: 'Nome', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }], success: 'Obrigado!' } }] }];

const pub = await j(await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish', slug, page: { id: slug, name: 'Debug Visitas', status: 'published', sections } }) }));
log('publish ok=' + pub.ok);

// visita (como a página pública faz ao abrir)
for (let i = 0; i < 3; i++) {
  const v = await j(await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'visit', slug }) }));
  log(`visita ${i + 1}: http-ok=${v.ok} contador=${v.visits}`);
}

// lead real com campos do formulário
const lead = await j(await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lead', slug, sectionId: 's2', elementId: 'e2', values: { nome: 'Joao Debug', email: 'joao@debug.pt' } }) }));
log('lead ok=' + lead.ok);

// listagem global (o que o dashboard lê)
const list = await j(await fetch(BASE + '/api/publish'));
const mine = (list.pages ?? []).find((p) => p.slug === slug);
log('listagem: visitas=' + mine?.visits + ' leads=' + mine?.leads + ' nome=' + mine?.name);

// mode=leads (o que o /leads lê)
const lds = await j(await fetch(`${BASE}/api/publish?slug=${slug}&mode=leads`));
log('mode=leads: nome=' + lds.pageName + ' primeiro=' + JSON.stringify(lds.leads?.[0]?.values));

// visita de slug inexistente não rebenta
const bad = await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'visit', slug: 'nao-existe-xx' }) });
log('visita-slug-falso: http=' + bad.status + ' (esperado 404)');

await fetch(BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unpublish', slug }) });
log('limpeza feita');
