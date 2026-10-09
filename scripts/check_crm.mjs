/**
 * E2E da API CRM na cloud: conta nova → publicar → lead → chave X-API-Key → pull
 * → webhook (eco na própria API) entregue com assinatura HMAC válida.
 * Não toca em dados do dono da instalação. Uso: node scripts/check_crm.mjs
 */
const API = 'https://app-d76b73421919.factorai.cloud';

const run = async () => {
  const stamp = Date.now();
  const email = `crm-e2e-${stamp}@teste.pt`;
  const slug = `e2e-crm-${stamp}`;
  const j = (r) => r.json();

  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'e2e-palavra-123', name: 'E2E CRM' }),
  }).then(j);
  if (!reg.token) throw new Error('registo falhou: ' + JSON.stringify(reg));
  const H = { 'content-type': 'application/json', Authorization: `Bearer ${reg.token}` };
  console.log('1. conta e2e criada ✓');

  const page = {
    id: `e2e-${stamp}`, name: 'Página E2E', status: 'published',
    sections: [
      { id: 's1', type: 'hero', title: 'Olá', style: {}, elements: [{ id: 'e1', type: 'text', content: { text: 'E2E', level: 'heading' } }] },
      { id: 's2', type: 'form', title: 'Form', elements: [{ id: 'e2', type: 'form', content: { title: 'Fala', success: 'OK' } }] },
    ],
  };
  const pub = await fetch(`${API}/publish`, { method: 'POST', headers: H, body: JSON.stringify({ slug, page }) }).then(j);
  if (!pub.ok) throw new Error('publish: ' + JSON.stringify(pub));
  console.log('2. página publicada ✓');

  // lead público antes da chave existir — o pull apanha-o na mesma
  await fetch(`${API}/leads`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, sectionId: 's2', elementId: 'e2', values: { email: 'e2e@x.pt' } }) });

  const key = await fetch(`${API}/account/api-keys`, { method: 'POST', headers: H, body: JSON.stringify({ label: 'e2e' }) }).then(j);
  if (!key.token) throw new Error('chave: ' + JSON.stringify(key));
  console.log('3. chave API criada ✓', key.key.prefix + '…');

  const KH = { 'content-type': 'application/json', 'X-API-Key': key.token };
  const pull = await fetch(`${API}/crm/v1/leads?slug=${slug}`, { headers: KH }).then(j);
  const lead = pull.leads?.[0];
  if (!lead || lead.values.email !== 'e2e@x.pt' || !lead.createdAt || lead.slug !== slug) {
    throw new Error('contrato do lead: ' + JSON.stringify(pull));
  }
  const pages = await fetch(`${API}/crm/v1/pages`, { headers: KH }).then(j);
  if (!pages.pages?.some((p) => p.slug === slug)) throw new Error('/crm/v1/pages não devolve a página');
  console.log('4. pull X-API-Key → contrato {slug,page,sectionId,elementId,values,createdAt} ✓');

  const hook = await fetch(`${API}/account/webhooks`, { method: 'POST', headers: H,
    body: JSON.stringify({ slug, url: `${API}/crm/v1/webhook-echo?slug=${slug}` }) }).then(j);
  if (!hook.secret) throw new Error('webhook: ' + JSON.stringify(hook));
  console.log('5. webhook definido (secret mostrado uma vez) ✓');

  await fetch(`${API}/leads`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, sectionId: 's2', elementId: 'e2', values: { email: 'hook@x.pt' } }) });
  let delivered = null;
  for (let i = 0; i < 12 && !delivered; i++) {
    await new Promise((s) => setTimeout(s, 2500));
    const hooks = await fetch(`${API}/account/webhooks`, { headers: H }).then(j);
    const h = hooks.webhooks?.find((w) => w.slug === slug);
    if (h?.lastDelivery) delivered = h.lastDelivery;
  }
  if (!delivered || delivered.ok !== '1') throw new Error('webhook não chegou assinado: ' + JSON.stringify(delivered));
  console.log('6. webhook entregue POST /crm/v1/… → HMAC-SHA256 válido ✓ (assinatura verificada pelo eco)');

  // arrumar o rasto
  await fetch(`${API}/account/webhooks/${slug}`, { method: 'DELETE', headers: H });
  await fetch(`${API}/account/api-keys/${key.key.id}`, { method: 'DELETE', headers: H });
  await fetch(`${API}/unpublish`, { method: 'POST', headers: H, body: JSON.stringify({ slug }) });
  console.log('7. limpeza feita — E2E CRM completo ✓');
};

run().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
