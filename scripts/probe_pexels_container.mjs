/* Testa o egress Pexels dentro do container da API (workload 138). */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');
const cmd = `python -c "import httpx; r=httpx.get('https://api.pexels.com/v1/search', headers={'Authorization':'fxDp9l9rgUyAY84DvPlJS2JtNN09ubunG4T7Hm78Dc5lca0kzDfP9lRS'}, params={'query':'seafood table','per_page':2}, timeout=20); print('status', r.status_code); print(r.text[:160])"`;
try {
  const out = execFileSync(process.execPath, [CLI, 'workload', 'exec', '-i', '138', '--timeout', '40', '--command', cmd], { encoding: 'utf8' });
  console.log(out.slice(-600));
} catch (e) {
  console.log('Falhou:', String(e.stdout ?? '').slice(-400), String(e.stderr ?? '').slice(-300));
}
