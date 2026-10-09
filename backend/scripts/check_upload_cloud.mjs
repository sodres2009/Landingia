/* Testa /upload na cloud: envia um PNG cru e faz GET da URL devolvida. */
const BASE = 'https://app-d76b73421919.factorai.cloud';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(320, 7)]);
const r = await fetch(`${BASE}/upload`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
const t = await r.text();
console.log('upload HTTP', r.status, t.slice(0, 90));
if (r.ok) {
  const url = JSON.parse(t).url;
  const g = await fetch(url);
  console.log('GET foto HTTP', g.status, g.headers.get('content-type'));
  const bad = await fetch(`${BASE}/upload`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: Buffer.alloc(200, 120) });
  console.log('rejeita não-imagem HTTP', bad.status, bad.status === 400 ? '✓' : '✗');
}
