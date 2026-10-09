'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Builder from '@/components/builder/Builder';
import { getPage, savePage } from '@/lib/storage';
import { api, tokenStore } from '@/lib/api';
import type { LandingPage } from '@/lib/types';

export default function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [page, setPage] = useState<LandingPage | null | 'loading'>('loading');

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!tokenStore.get()) router.replace('/login'); // editar exige conta — o servidor recusa sem token
  }, [router]);

  useEffect(() => {
    if (!id) return;
    setPage(getPage(id)); // localStorage abre já; o backend (fonte em rede) atualiza se houver versão lá
    void api.pageGet(id).then((d) => setPage(d.page as LandingPage)).catch(() => undefined);
  }, [id]);

  function persist(p: LandingPage) {
    savePage(p);
    void api.pageSave(p).catch(() => undefined); // espelha no backend; offline fica no browser
  }

  if (page === 'loading') return <main className="shell"><p className="intro">A carregar…</p></main>;
  if (!page) {
    return (
      <main className="shell">
        <div className="empty">
          <h2>Página não encontrada</h2>
          <p><Link href="/" className="btn primary small">Voltar ao Dashboard</Link></p>
        </div>
      </main>
    );
  }
  return <Builder page={page} onSave={persist} />;
}
