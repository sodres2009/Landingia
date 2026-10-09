/* /agent/intent com contexto rico — pedidos informais devem acertar a ação. */
const BASE = process.env.API_BASE || 'http://127.0.0.1:8100';
const pageState = {
  context: 'Workshop de fotografia de produto em Lisboa, 24 de outubro, 12 vagas, 180€ com material incluído',
  sections: [
    { type: 'hero', title: 'Fotografia de produto', excerpt: 'Doze vagas. Um fim de semana. O teu produto em capa de revista.' },
    { type: 'benefits', title: 'O que vais aprender', excerpt: 'Luz de estúdio | Tratamento raw | Montagem de cena' },
    { type: 'pricing', title: 'Investimento', excerpt: '180€ · material incluído' },
    { type: 'form', title: 'Inscrição', excerpt: 'Nome | Email | Data pretendida' },
  ],
};
const probes = [
  ['poe uma foto de camera', null],
  ['aquilo ta muito longo encurta', null],
  ['mete uma secçao de perguntas frequentes', null],
];
for (const [instruction, selection] of probes) {
  const r = await fetch(`${BASE}/agent/intent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction, selection, ...pageState }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  console.log(`"${instruction}" → ${j.kind} @ ${j.section_type ?? '-'}${j.reply ? ' | ' + j.reply : ''}`);
}
