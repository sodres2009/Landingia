/* HEAD-check das fotos curadas novas (e par de controlo). */
const ids = [
  'photo-1503951914875-452162b0f3f1',
  'photo-1585747860715-2ba37e788b70',
  'photo-1599351431202-1e0f01378a41',
  'photo-1522336572468-d7a42a08e2a7',
];
for (const id of ids) {
  try {
    const r = await fetch(`https://images.unsplash.com/${id}?w=100`, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    console.log(`${r.ok ? '✓' : '✗'} ${r.status} ${id}`);
  } catch (e) {
    console.log(`✗ erro ${id}: ${e.message}`);
  }
}
