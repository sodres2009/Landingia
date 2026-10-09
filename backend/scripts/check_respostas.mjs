/* E2E plano: respostas do cliente têm de aparecer; headline com *destaque*. */
const BASE = 'https://app-d76b73421919.factorai.cloud';
const r = await fetch(`${BASE}/agent/plan?variants=1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Clínica dentária no Porto, marcação online.',
    objective: 'Marcar reuniões', style: 'Elegante',
    context: { brandColors: [], answers: { preco: 'Primeira consulta de avaliação por 25€', zona: 'Matosinhos' } },
    answers: { preco: 'Primeira consulta de avaliação por 25€', zona: 'Matosinhos' },
  }),
  signal: AbortSignal.timeout(180000),
});
if (!r.ok) { console.log('FALHOU', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
const d = await r.json();
const plan = (d.plans ?? []).find((x) => x.ok)?.plan;
const allText = JSON.stringify(plan.sections);
console.log('theme:', plan.theme ? `${plan.theme.mode}/${plan.theme.font}` : 'AUSENTE');
console.log('respeita preço 25€?', /25\s*€|25 euros|25€/.test(allText) ? '✓ aparece na página' : '— não veio neste plano');
console.log('respeita zona Matosinhos?', /matosinhos/i.test(allText) ? '✓' : '—');
const heads = plan.sections.flatMap((s) => s.elements.filter((e) => e.type === 'text' && ['heading', 'title'].includes(String(e.content.level))));
const asterisk = heads.some((h) => /\*[^*]+\*/.test(String(h.content.text)));
console.log('headline com *destaque*?', asterisk ? '✓' : '— (sem asterisco neste plano)');
console.log('headline hero:', String(heads[0]?.content.text ?? '').slice(0, 80));
