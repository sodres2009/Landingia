/* Teste final cloud: 3 pedidos — foto real Pexels, troca real, e geração. */
const BASE = 'https://app-d76b73421919.factorai.cloud';
async function img(instruction, exclude = []) {
  const r = await fetch(`${BASE}/agent/image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction, exclude, context: { productSummary: 'Restaurante de mariscos em Matosinhos', visualDirection: 'tons quentes' } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`image ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}
const a = await img('mesa de restaurante com mariscos e vinho');
const b = await img('mesa de restaurante com mariscos e vinho', [a.url]);
const c = await img('dragão de neon roxo flutuando sobre a cidade do Porto à chuva');
console.log(`1: ${a.source} ${a.url.slice(0, 60)}`);
console.log(`2: ${b.source} ${b.url.slice(0, 60)} ${b.url !== a.url ? '✓ troca' : '✗ MESMA'}`);
console.log(`3: ${c.source} ${c.url.slice(0, 60)}`);
