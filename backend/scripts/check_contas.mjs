/* Regressão cloud: rotas privadas fechadas e páginas públicas abertas.
   NÃO registra conta — a primeira conta é do Bruno (fica admin). */
const API = 'https://app-d76b73421919.factorai.cloud';

for (const [method, path] of [['GET', '/pages'], ['GET', '/published'], ['GET', '/leads']]) {
  const r = await fetch(API + path, { method });
  console.log(`${method} ${path} anónimo →`, r.status, r.status === 401 ? '✓ privado' : '✗ devia ser 401');
}
const up = await fetch(`${API}/upload`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: new Blob([new Uint8Array(200)]) });
console.log('POST /upload anónimo →', up.status, up.status === 401 ? '✓ privado' : '✗');

// visitar e submeter formulários continuam abertos a anónimos (é o trabalho da página)
const health = await (await fetch(`${API}/healthz`)).json();
console.log('healthz:', JSON.stringify(health));
const visit = await fetch(`${API}/visit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: 'nao-existe-x' }) });
console.log('POST /visit público →', visit.status, visit.status === 404 ? '✓ aberto (404 esperado para slug inexistente)' : '⚠');
