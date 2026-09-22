/* Testa a interpretação de intenção de imagens pelo agente. */
const BASE = process.env.BASE || 'http://localhost:3005';
const log = (...a) => console.log(...a);

const casos = [
  'quero uma equipa jovem e moderna num escritório luminoso',
  'mechanics a trabalhar num carro numa oficina moderna',
  'colocoação de dentista a atender uma criança sorridente',
];
for (const instr of casos) {
  const t0 = Date.now();
  const r = await fetch(BASE + '/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'image', instruction: instr, objective: 'Captar leads', context: { productSummary: 'clínica dentária no Porto', visualQueries: ['dentist', 'clinic'] }, exclude: [] }),
    signal: AbortSignal.timeout(120000),
  });
  const d = await r.json();
  log(`pedido: "${instr.slice(0, 50)}…"\n  http=${r.status} fonte=${d.source} url=${d.url}\n  alt=${d.alt} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
}
