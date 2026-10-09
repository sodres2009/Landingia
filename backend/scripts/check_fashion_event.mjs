/* Regressão cloud: loja de roupa + evento de coleção → imagens com nexo (sem cegonha no telhado). */
const API = 'https://app-d76b73421919.factorai.cloud';
let r;
for (let i = 0; i < 4; i++) {
  r = await fetch(`${API}/agent/plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Loja de roupa independente no Porto vai fazer um evento de venda exclusivo da nova coleção cápsula de inverno, dia 15 de novembro na loja. Convites limitados a 80 pessoas, champagne e DJ. Objetivo: inscrições para o evento.',
      objective: 'Inscrições para o evento', style: 'Moderno', depth: 'rich',
    }),
    signal: AbortSignal.timeout(300000),
  });
  if (r.ok) break;
  await new Promise((s) => setTimeout(s, 5000)); // free tier 502 em rajada
}
if (!r.ok) { console.log('HTTP', r.status); process.exit(1); }
const plan = (await r.json()).plans[0].plan;
const imgs = plan.sections.flatMap((s) => s.elements).filter((e) => e.type === 'image');
console.log(`imagens: ${imgs.length}`);
const BAD = /stork|cegonha|roof|telhado|gato|cat\b/i;
for (const im of imgs) {
  const src = /^https:\/\/images\.pexels/.test(im.content.url) ? 'pexels' : /^https:\/\/image\.pollinations/.test(im.content.url) ? 'ai' : im.content.url ? 'outra' : 'sem url';
  console.log(`- [${src}] alt="${(im.content.alt ?? '').slice(0, 70)}" url=${String(im.content.url).slice(0, 70)}`);
  if (BAD.test(String(im.content.alt))) console.log('  ✗ IMAGEM FORA DE TEMA');
}
console.log(imgs.length === 0 || imgs.every((im) => im.content.url) ? '✓ todas as imagens têm url' : '⚠ imagens sem url (serão tratadas na troca)');
