/* Verifica /images/search na API em produção (cloud por omissão). */
const BASE = process.env.API_BASE || 'https://app-d76b73421919.factorai.cloud';
for (const q of ['jiu-jitsu', 'conferência empresarial moderna', 'carros seminovos']) {
  const r = await fetch(`${BASE}/images/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  console.log(`"${q}" http=${r.status} source=${j.source}`);
  for (const p of (j.photos ?? []).slice(0, 3)) console.log('  -', String(p.url).slice(0, 100));
}
