/* Ver o campo theme cru que a cloud devolve num plan curto. */
const BASE = process.env.API_BASE || 'https://app-d76b73421919.factorai.cloud';
const r = await fetch(`${BASE}/agent/plan?variants=1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: 'Barbearia clássica no Porto, cortes e barba, marcação online.', objective: 'Captar leads', style: 'Moderno' }),
  signal: AbortSignal.timeout(180000),
});
const j = await r.json();
const p = (j.plans ?? []).find((x) => x.ok)?.plan;
console.log('ok:', !!p);
console.log('theme:', JSON.stringify(p?.theme));
console.log('brandColors:', JSON.stringify(p?.brandColors));
