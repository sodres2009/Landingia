'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, tokenStore, type ApiUser } from '@/lib/api';

const links = [
  { href: '/leads', label: 'Leads' },
  { href: '/bookings', label: 'Agendamento' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/#publicadas', label: 'Publicadas' },
  { href: '/settings', label: 'Definições' },
  { href: '/help', label: 'Ajuda' },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);

  useEffect(() => {
    if (!tokenStore.get()) return;
    void api.me().then((d) => setUser(d.user)).catch(() => tokenStore.clear());
  }, []);

  function logout() {
    tokenStore.clear();
    router.push('/login');
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="logo"><span className="mark">✦</span><b>Landing<em>AI</em></b></Link>
        <div className="spacer" />
        {user ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10 }}>
            <span className="ai-label" title={user.email}>{user.name}</span>
            <button className="btn ghost small" onClick={logout}>Sair</button>
          </span>
        ) : (
          <Link href="/login" className="btn ghost small" style={{ marginRight: 10 }}>Entrar</Link>
        )}
        <Link href="/create" className="btn primary">+ Criar Landing Page</Link>
      </header>
      <nav className="topnav" style={{ padding: '8px 18px', display: 'flex' }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>{l.label}</Link>
        ))}
      </nav>
    </>
  );
}
