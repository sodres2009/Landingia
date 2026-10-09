/**
 * Redeploy da Landing AI para a Gaudencio-Cloud via gaudi-cli.
 *
 *   node scripts/deploy-gaudi.mjs            # build + upload + restart (workload 136)
 *   node scripts/deploy-gaudi.mjs 136        # outro workload
 *
 * O contentor do template "Canva Empresa (Node 24)" arranca com `tail -f /dev/null`,
 * por isso a app tem de ser iniciada por aqui sempre que o contentor reiniciar.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKLOAD = process.argv[2] ?? '136';
const PREVIEW = 'https://app-ed93ae2db29d.factorai.cloud';
const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');

function run(cmd, args, label, shell = false) {
  console.log(`\n$ ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell });
  if (r.status !== 0) throw new Error(`${label} falhou (exit ${r.status})`);
}

// Os binários node são chamados diretamente (.cmd do npm não corre fiável aqui).
const gaudi = (args, label) => run(process.execPath, [CLI, ...args], label);

// 1. Build de produção (standalone, ver next.config.ts).
// NEXT_PUBLIC_* é inlinhado no bundle do browser em build — em cloud tem de
// apontar para o backend FastAPI público, nunca para o 127.0.0.1 do .env.local.
process.env.NEXT_PUBLIC_API_URL = 'https://app-d76b73421919.factorai.cloud';
run(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], 'next build');

// 2. Pastagem: standalone + assets estáticos + public
const stage = path.join(ROOT, '_deploy');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(path.join(ROOT, '.next', 'standalone'), stage, { recursive: true });
cpSync(path.join(ROOT, '.next', 'static'), path.join(stage, '.next', 'static'), { recursive: true });
if (existsSync(path.join(ROOT, 'public'))) cpSync(path.join(ROOT, 'public'), path.join(stage, 'public'), { recursive: true });

// 3. Um único ficheiro (a API recusa cópias com >1000 ficheiros)
const tar = path.join(ROOT, 'app.tar.gz');
rmSync(tar, { force: true });
run('C:\\Windows\\System32\\tar.exe', ['-czf', tar, '-C', stage, '.'], 'tar -czf app.tar.gz');

// 4. Upload para /tmp e substituição limpa em /app
gaudi(['workload', 'copy-file', '-i', WORKLOAD, '--file', tar, '--path', '/tmp', '--filename', 'app.tar.gz'], 'upload app.tar.gz');
gaudi(['workload', 'exec', '-i', WORKLOAD, '--timeout', '180', '--command',
  'mkdir -p /app && rm -rf /app/* && tar -xzf /tmp/app.tar.gz -C /app && rm /tmp/app.tar.gz && ls /app'], 'extrair em /app');

// 5. Parar o servidor antigo. A imagem slim não tem pkill/procps — varre /proc
// e mata `node` e `next-server` (Next muda o título do processo), nunca o shell.
const KILL_NODE = 'for d in /proc/[0-9]*; do c=$(cat $d/comm 2>/dev/null); case "$c" in node|next-server*) kill ${d#/proc/} 2>/dev/null;; esac; done; sleep 2; for d in /proc/[0-9]*; do c=$(cat $d/comm 2>/dev/null); case "$c" in node|next-server*) kill -9 ${d#/proc/} 2>/dev/null;; esac; done; sleep 1; echo stopped';
gaudi(['workload', 'exec', '-i', WORKLOAD, '--timeout', '30', '--command', KILL_NODE], 'parar servidor');

// 6. Arrancar a nova build em background e confirmar que responde localmente.
gaudi(['workload', 'exec', '-i', WORKLOAD, '--timeout', '120', '--command',
  'mkdir -p /data/published; cd /app && (HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production PUBLISHED_DIR=/data/published nohup node server.js > /tmp/app.log 2>&1 &); sleep 4; tail -5 /tmp/app.log; node -e "fetch(\'http://127.0.0.1:3000/\').then(r=>console.log(\'LOCAL_HTTP\',r.status)).catch(e=>console.log(\'LOCAL_ERR\',e.message))"'],
  'iniciar servidor');

rmSync(stage, { recursive: true, force: true });
rmSync(tar, { force: true });
console.log(`\nDeploy concluído: ${PREVIEW}`);
