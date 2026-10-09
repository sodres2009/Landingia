/* POSTa /agent/image repetidamente; cada chamada deve devolver foto nova. */
const BASE = process.env.API_BASE || 'http://127.0.0.1:8100';
const seen = [];
for (let i = 0; i < 3; i++) {
  const r = await fetch(`${BASE}/agent/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // O editor manda as URLs já usadas como exclude — simulamos aqui.
    body: JSON.stringify({
      instruction: 'Põe uma foto de treino de jiu-jitsu',
      exclude: [...seen],
      context: { productSummary: 'Academia de jiu-jitsu em Coimbra', visualDirection: 'real', visualQueries: ['jiu jitsu training'] },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json();
  if (!r.ok) { console.error('ERRO', r.status, JSON.stringify(j)); process.exit(1); }
  seen.push(j.url);
  console.log(`${i + 1}: ${j.source} ${j.url.slice(0, 90)}`);
}
const uniq = new Set(seen);
console.log(uniq.size === seen.length ? 'OK — sempre foto diferente' : 'FALHOU — repetiu foto');
process.exit(uniq.size === seen.length ? 0 : 1);
