/* SSE do /agent/plan/stream — o /create vai consumir isto. */
const BASE = 'http://127.0.0.1:8100';
const res = await fetch(BASE + '/agent/plan/stream?variants=2', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: 'clinica dentaria em leiria com implantes', objective: 'Marcar reunioes', style: 'Elegante' }),
  signal: AbortSignal.timeout(300000),
});
console.log('http=' + res.status + ' content-type=' + res.headers.get('content-type'));
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
let events = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf('\n\n')) >= 0) {
    const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const d = JSON.parse(line.slice(6));
      events++;
      if (d.event === 'plan') console.log('evento plan: index=' + d.index + ' ok=' + d.ok + (d.ok ? ' seccoes=' + d.plan.sections.length : ' erro=' + d.error));
      else console.log('evento ' + d.event + (d.index !== undefined ? ' index=' + d.index : ''));
    }
  }
}
console.log('total-eventos=' + events + ' (esperado: 2 progress + 2 plan + done = 5)');
