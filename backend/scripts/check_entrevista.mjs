/* E2E entrevista: briefing vago → perguntas + porque; briefing rico → poucas/zero. */
const BASE = 'https://app-d76b73421919.factorai.cloud';
async function iv(body) {
  const r = await fetch(`${BASE}/agent/interview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`);
  return JSON.parse(t);
}
const vago = await iv({ description: 'app de agendamento para barbeiros', objective: 'Captar leads', style: 'Moderno' });
console.log('— VAGO —');
console.log('resumo:', (vago.summary || '').slice(0, 110));
console.log('perguntas:', vago.questions.length);
for (const q of vago.questions) console.log(`  · [${q.needs}] ${q.question}  (why: ${q.why})`);
const fotos = vago.questions.some((q) => q.needs === 'photo');
console.log('tem pergunta de foto?', fotos ? '✓' : '—');

const rico = await iv({
  description: 'Clínica Dentária Sorriso Porto, 12 anos, consulta avaliação 25€, marcação online, 4,8 estrelas em 320 avaliações.',
  objective: 'Marcar reuniões', style: 'Elegante',
});
console.log('\n— RICO —');
console.log('resumo:', (rico.summary || '').slice(0, 110));
console.log('perguntas:', rico.questions.length, rico.questions.length <= 2 ? '✓ (não enche)' : '(muitas)');
