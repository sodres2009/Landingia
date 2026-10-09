/* Confirma que a cloud serve o build mais recente (comparação de buildId). */
const html = await (await fetch('https://app-ed93ae2db29d.factorai.cloud/', { signal: AbortSignal.timeout(30000) })).text();
const id = (html.match(/"buildId":"([^"]+)"/) ?? [])[1] ?? '?';
console.log('cloud buildId:', id, '| http ok,', html.length, 'bytes');
// chunk do editor deve existir no novo build
const editorChunk = html.match(/static\/chunks\/[a-z0-9._-]+\.js/g)?.slice(0, 3) ?? [];
console.log(editorChunk.join('\n'));
