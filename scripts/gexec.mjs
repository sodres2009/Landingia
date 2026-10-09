/** exec seguro no container: node scripts/gexec.mjs <workload-id> "<comando>" */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');
const [id, ...rest] = process.argv.slice(2);
// cmd.exe preserva as aspas duplas dentro de argv — o container recebe-as
// literalmente e o sh parte o comando. Limpar as aspas das pontas.
const command = rest.join(' ').replace(/^"+/, '').replace(/"+$/, '');
const r = spawnSync('node', [CLI, 'workload', 'exec', '-i', id, '--command', command, '--json', '--timeout', '120'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
try {
  const d = JSON.parse(r.stdout);
  if (d.stdout) process.stdout.write(d.stdout);
  if (d.stderr) process.stderr.write('[stderr] ' + d.stderr);
  process.exit(d.exit_code ?? 0);
} catch {
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  process.exit(r.status ?? 1);
}
