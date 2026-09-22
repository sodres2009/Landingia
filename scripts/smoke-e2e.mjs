/* E2E smoke: criar→3 propostas→página→publicar→URL pública→leads. */
const BASE = process.env.BASE || 'http://localhost:3005';
const log = (...a) => console.log(...a);

async function post(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  // 1) três propostas em fila (como o /create faz agora)
  const hints = ['Abordagem montra', 'Abordagem autoridade', 'Abordagem direta'];
  const plans = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const { status, data } = await post('/api/ai', {
      action: 'plan',
      description: 'stand de venda de carros seminovos em Coimbra',
      objective: 'Captar leads', style: 'Moderno', variantHint: hints[i],
    });
    const secs = Array.isArray(data.sections) ? data.sections.length : 0;
    const layouts = (data.sections ?? []).map((s) => s.style?.layout ?? 'stack').join(',');
    const yrs = [...new Set(JSON.stringify(data).match(/20(1\d|2[0-5])/g) ?? [])];
    log(`proposta ${i + 1}: http=${status} source=${data.source ?? data.engine} seccoes=${secs} ${(Date.now() - t0) / 1000}s anos-maus=${yrs.join('|') || 'nenhum'}`);
    log(`   layouts: ${layouts}`);
    log(`   hero: ${JSON.stringify((data.sections?.[0]?.elements?.find((e) => e.type === 'text')?.content?.text ?? '')).slice(0, 90)}`);
    if (secs) plans.push(data);
    await new Promise((r) => setTimeout(r, 1500));
  }
  log('propostas-reais=' + plans.filter((p) => p.source === 'provider').length + '/3');
  if (!plans.length) { log('FALHOU: nenhuma proposta'); return; }

  // 2) publicar a primeira proposta e abrir a URL pública
  const slug = 'e2e-smoke-' + Date.now().toString(36);
  const pub = await post('/api/publish', {
    action: 'publish',
    slug,
    page: { id: slug, name: 'E2E Smoke', status: 'published', aiContext: { cta: plans[0].cta }, sections: plans[0].sections },
  });
  log(`publicar: http=${pub.status} slug=${slug} ok=${pub.data?.ok === true}`);
  if (pub.status !== 200) return;
  const pageRes = await fetch(`${BASE}/p/${slug}`);
  const html = await pageRes.text();
  const hasHero = html.includes('lp-section');
  const hasLayout = html.includes('lp-layout--');
  log(`url-publica: http=${pageRes.status} seccoes-renderizadas=${hasHero} layouts=${hasLayout}`);

  // 3) submeter o formulário da página pública → lead (mesmo pedido do browser)
  const formSec = (plans[0].sections ?? []).find((s) => (s.elements ?? []).some((e) => e.type === 'form'));
  const formEl = formSec?.elements?.find((e) => e.type === 'form');
  const lead = await post('/api/publish', { action: 'lead', slug, sectionId: formSec?.id ?? '', elementId: formEl?.id ?? '', values: { nome: 'Teste E2E', email: 'e2e@teste.pt' } });
  log(`lead: http=${lead.status} ok=${lead.status < 300} ${JSON.stringify(lead.data).slice(0, 60)}`);

  const bad = [...new Set(html.match(/20(1\d|2[0-5])/g) ?? [])];
  log('anos-maus-na-url=' + (bad.join('|') || 'nenhum'));
})();
