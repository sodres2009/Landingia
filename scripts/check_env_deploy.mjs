/* Diagnóstico do .env de deploy: mostra só comprimentos, nunca as chaves. */
import { readFileSync } from 'node:fs';
const envLocal = readFileSync('../.env.local', 'utf8');
const pick = (key) => envLocal.split('\n').find((l) => l.startsWith(key + '='))?.split('=').slice(1).join('=').trim() ?? '';
for (const k of ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'PEXELS_API_KEY']) {
  console.log(`${k}: len=${pick(k).length}`);
}
