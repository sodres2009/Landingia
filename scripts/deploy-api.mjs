/**
 * Deploy do backend FastAPI para o workload landing-api (Gaudencio).
 * 1. Gera .deploy.env com as chaves do .env.local do app (nunca as mostra)
 * 2. copy-dir backend/app → /app/app ; .deploy.env → /app/.env
 * 3. Mata o uvicorn antigo e arranca app.main:app na 8000 (porta do template)
 * 4. Verifica /healthz local e público
 * Uso: node scripts/deploy-api.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');           // landing-ai-v3/
const BACKEND = path.join(ROOT, 'backend');
const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');
const WORKLOAD_ID = '138';
const PUBLIC_URL = 'https://app-d76b73421919.factorai.cloud';

function cli(args, label) {
  console.log(`\n$ ${label ?? args.slice(0, 2).join(' ')}`);
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) { process.stderr.write(r.stderr ?? ''); throw new Error(`CLI falhou (${r.status}): ${args.join(' ')}`); }
}

// 1. env de deploy (chaves lidas do .env.local, nunca impressas)
const envLocal = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const pick = (key) => envLocal.split('\n').find((l) => l.startsWith(key + '='))?.split('=').slice(1).join('=').trim() ?? '';
const deployEnv = [
  `AI_BASE_URL=${pick('AI_BASE_URL') || 'https://api.groq.com/openai/v1'}`,
  `AI_API_KEY=${pick('AI_API_KEY')}`,
  `AI_MODEL=${pick('AI_MODEL')}`,
  `FACTOR_APP_ID=${pick('FACTOR_APP_ID') || 'landing-ai'}`,
  `AI_TIMEOUT=${pick('AI_TIMEOUT') || '55'}`,
  `FALLBACK_BASE_URL=${pick('FALLBACK_BASE_URL')}`,
  `FALLBACK_API_KEY=${pick('FALLBACK_API_KEY')}`,
  `FALLBACK_MODEL=${pick('FALLBACK_MODEL')}`,
  `PEXELS_API_KEY=${pick('PEXELS_API_KEY')}`,
  'DB_PATH=/data/landing.db',
  'ALLOWED_ORIGINS=*',
  '',
].join('\n');
if (!deployEnv.includes('AI_API_KEY=gsk_') && !deployEnv.includes('AI_API_KEY=sk')) console.warn('aviso: AI_API_KEY pode não estar no .env.local');
const envFile = path.join(BACKEND, '.deploy.env');
fs.writeFileSync(envFile, deployEnv);

// 2. código + env + shim main.py para o container
cli(['workload', 'copy-dir', '-i', WORKLOAD_ID, '--path', '/app/app', '--dir', path.join(BACKEND, 'app'), '--json'], 'copiar app/ → /app/app');
cli(['workload', 'copy-file', '-i', WORKLOAD_ID, '--path', '/app', '--file', envFile, '--filename', '.env', '--json'], 'copiar .env');
// O template corre `uvicorn main:app` — o nosso shim redireciona para app.main.
// (NUNCA matar o uvicorn à mão: é o PID 1 do container e hospeda o próprio exec.)
cli(['workload', 'copy-file', '-i', WORKLOAD_ID, '--path', '/app', '--file', path.join(BACKEND, 'container_main.py'), '--filename', 'main.py', '--json'], 'shim main.py');
fs.unlinkSync(envFile);

// 3. restart limpo (o gestor do container arranca o nosso app via shim)
cli(['workload', 'stop', '-i', WORKLOAD_ID], 'parar');
await new Promise((r) => setTimeout(r, 6000));
cli(['workload', 'deploy', '-i', WORKLOAD_ID], 'arrancar');
await new Promise((r) => setTimeout(r, 9000));

// 4. health público
const health = await fetch(`${PUBLIC_URL}/healthz`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json());
console.log(`\nBackend público: ${PUBLIC_URL}/healthz →`, JSON.stringify(health));
if (!health.ok) throw new Error('health público falhou');
console.log('Deploy da API concluído.');
