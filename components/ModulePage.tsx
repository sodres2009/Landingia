'use client';

import Link from 'next/link';
import TopNav from '@/components/TopNav';

/** Placeholder honesto para módulos do roadmap — sem números inventados. */
export default function ModulePage({ title, icon, points }: { title: string; icon: string; points: string[] }) {
  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head">
          <div>
            <h1>{icon} {title}</h1>
            <p>Módulo em desenvolvimento neste MVP.</p>
          </div>
          <Link href="/" className="btn ghost">← Dashboard</Link>
        </div>
        <div className="create-card">
          <span className="spark">ROADMAP</span>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>O que aí vem</h2>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 10 }}>
            {points.map((p, i) => <li key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>✓ {p}</li>)}
          </ul>
        </div>
      </main>
    </>
  );
}
