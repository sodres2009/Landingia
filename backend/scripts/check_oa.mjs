import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('./oa-cloud.json', 'utf8'));
const names = Object.keys(j.components?.schemas ?? {});
console.log('schemas:', names.join(', '));
for (const n of names) {
  const props = j.components.schemas[n]?.properties;
  if (props && ('theme' in props || 'depth' in props)) console.log(`${n} tem:`, Object.keys(props).join(','));
}
