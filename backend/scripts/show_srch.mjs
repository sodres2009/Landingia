import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('./srch.json', 'utf8'));
console.log('source:', j.source, '| fotos:', (j.photos ?? []).length, '|', j.photos?.[0]?.url?.slice(0, 70));
