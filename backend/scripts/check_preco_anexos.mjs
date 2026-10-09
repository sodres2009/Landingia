/* Regressão cloud: /upload-doc + briefing com preço literal e anexo PDF linkável. */
const API = 'https://app-d76b73421919.factorai.cloud';

// 1) anexo PDF → URL servida
const pdf = new Blob(['%PDF-1.4 test menu do restaurante ' + 'x'.repeat(500)], { type: 'application/pdf' });
const up = await (await fetch(`${API}/upload-doc`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf })).json();
console.log('upload-doc:', up.ok ? `✓ ${up.url.slice(0, 70)}` : `✗ ${JSON.stringify(up)}`);
const back = await fetch(up.url);
console.log('serve:', back.ok ? '✓ PDF recupera por URL' : '✗ URL do PDF não serve');

// 2) plano com preço + documento no briefing
let r;
for (let i = 0; i < 4; i++) {
  r = await fetch(`${API}/agent/plan`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description: 'Loja de roupa no Porto. ' + up.url +
        '\nPREÇO OFICIAL (usa literalmente, não inventes outro): Coleção cápsula: casacos 89€, camisas 45€',
      objective: 'Vender produto/serviço', style: 'Moderno', depth: 'short',
    }),
    signal: AbortSignal.timeout(300000),
  });
  if (r.ok) break;
  await new Promise((s) => setTimeout(s, 5000));
}
if (!r.ok) { console.log('plan HTTP', r.status); process.exit(1); }
const plan = (await r.json()).plans[0].plan;
const all = JSON.stringify(plan.sections);
console.log(/89€|89 €/.test(all) ? '✓ preço literal do campo chegou à página' : '✗ preço ausente');
console.log(all.includes(up.url) || /menu|pdf|cat[áa]logo|ver em/i.test(all) ? '✓ documento do cliente usado/linkado' : '⚠ documento ignorado neste plano');
