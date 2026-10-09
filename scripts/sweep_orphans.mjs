/* Varre a BD da cloud: publicadas cujo rascunho já não existe (órfãos do bug). */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const CLI = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@nomad-e', 'gaudi-cli', 'bin', 'gaudi-cli.js');
const PY = process.env.APPLY
  ? [
      'import sqlite3',
      'c=sqlite3.connect("/data/landing.db")',
      'ids={r[0] for r in c.execute("select id from pages")}',
      'pub=c.execute("select slug,page_id from published").fetchall()',
      'for s,pid in pub:',
      '    if (pid or "") not in ids:',
      '        c.execute("delete from published where slug=?", (s,)); c.execute("delete from leads where slug=?", (s,)); c.execute("delete from webhooks where slug=?", (s,))',
      '        print("apaguei "+s)',
      'c.commit()',
    ]
  : [
      'import sqlite3',
      'c=sqlite3.connect("/data/landing.db")',
      'pub=c.execute("select slug,name,page_id,owner_id,published_at,visits from published order by published_at").fetchall()',
      'ids={r[0] for r in c.execute("select id from pages")}',
      'for s,n,pid,own,at,v in pub:',
      '    print(("ORPHAN " if (pid or "") not in ids else "ok     ")+"|"+s+"|"+str(n)+"|visits="+str(v)+"|own="+str(own)[:8]+"|"+at[:10])',
    ];
const cmd = `python3 - <<'EOF'\n${PY.join('\n')}\nEOF`;
const r = spawnSync('node', [CLI, 'workload', 'exec', '-i', '138', '--command', cmd, '--json', '--timeout', '120'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
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
