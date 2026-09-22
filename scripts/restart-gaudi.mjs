/** Reinicia o Next no contentor 136 e confirma que a nova build responde. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');
function exec(cmd, timeout) {
  return spawnSync(process.execPath, [CLI, 'workload', 'exec', '-i', '136', '--timeout', String(timeout), '--command', cmd], { cwd: ROOT, stdio: 'inherit' });
}
exec('for d in /proc/[0-9]*; do c=$(cat $d/comm 2>/dev/null); case "$c" in node|next-server*) kill ${d#/proc/} 2>/dev/null;; esac; done; sleep 2; for p in /proc/[0-9]*; do c=$(cat $p/comm 2>/dev/null); echo "$p=$c"; done | grep -iE "node|next" ; echo stopped', 30);
const r = exec('mkdir -p /data/published; cd /app && (HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production PUBLISHED_DIR=/data/published nohup node server.js > /tmp/app.log 2>&1 &); sleep 4; tail -6 /tmp/app.log; node -e "fetch(\'http://127.0.0.1:3000/api/publish?slug=x\').then(r=>console.log(\'API_PUBLISH\',r.status)).catch(e=>console.log(\'ERR\',e.message))"', 120);
process.exit(r.status ?? 1);
