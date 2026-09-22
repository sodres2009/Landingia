'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/leads', label: 'Leads' },
  { href: '/bookings', label: 'Agendamento' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/settings', label: 'Definições' },
  { href: '/help', label: 'Ajuda' },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <>
      <header className="topbar">
        <Link href="/" className="logo"><span className="mark">✦</span><b>Landing<em>AI</em></b></Link>
        <div className="spacer" />
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
