/* Entrevista com o briefing do print — não pode perguntar cozinha/cidade/nome. */
const BASE = 'https://app-d76b73421919.factorai.cloud';
const r = await fetch(`${BASE}/agent/interview`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    description: 'Quero criar uma Landing Page para uma marisqueira em Matosinhos. O negócio chama-se Marisqueira O Portuense e é especializado em mariscos.',
    objective: 'Marcar reuniões', style: 'Moderno',
  }),
  signal: AbortSignal.timeout(120000),
});
const d = await r.json();
console.log('resumo:', (d.summary || '').slice(0, 130));
console.log('perguntas:', d.questions.length);
for (const q of d.questions) console.log(`  · [${q.needs}] ${q.question}`);
const low = JSON.stringify(d.questions).toLowerCase();
const banais = ['tipo de cozinha', 'cidade', 'local', 'nome', 'onde fica'];
const hits = banais.filter((b) => low.includes(b));
console.log(hits.length === 0 ? '✓ zero perguntas repetidas do briefing' : `✗ ainda repete: ${hits.join(', ')}`);
