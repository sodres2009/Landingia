/* Migra páginas publicadas do sistema antigo (workload 136, /data/published)
 * para o backend FastAPI novo. Idempotente: ignora slugs que já existem. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const NEW_API = process.env.NEW_API || 'https://app-d76b73421919.factorai.cloud';
const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');

function execOld(command) {
  const r = spawnSync('node', [CLI, 'workload', 'exec', '-i', '136', '--command', command, '--json', '--timeout', '60'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const d = JSON.parse(r.stdout);
  if (d.exit_code !== 0) throw new Error(d.stderr || d.output || 'exec falhou');
  return d.stdout;
}

const listing = execOld('ls /data/published').trim().split('\n').filter((f) => f.endsWith('.json'));
const existing = new Set(((await (await fetch(`${NEW_API}/published`)).json()).pages ?? []).map((p) => p.slug));

for (const file of listing) {
  const slug = file.replace(/\.json$/, '');
  if (existing.has(slug)) { console.log(`${slug}: já existe, skip`); continue; }
  const stored = JSON.parse(execOld(`cat /data/published/${file}`));
  const page = stored.page ?? stored;
  const res = await fetch(`${NEW_API}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, page }),
  });
  console.log(`${slug}: publish ${res.status}`);
  // leads JSONL do sistema antigo
  try {
    const leads = execOld(`cat /data/published/${slug}.leads.jsonl 2>/dev/null || true`).trim().split('\n').filter(Boolean);
    for (const line of leads) {
      const l = JSON.parse(line);
      const ok = await fetch(`${NEW_API}/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, sectionId: l.sectionId ?? '', elementId: l.elementId ?? '', values: l.values ?? {} }),
      }).then((r) => r.ok);
      console.log(`  lead: ${ok ? 'ok' : 'falhou'}`);
    }
  } catch { /* sem leads */ }
}
console.log('migração concluída');
