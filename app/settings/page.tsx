'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import { getSettings, saveSettings, type Settings } from '@/lib/storage';

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState('local');

  useEffect(() => {
    setS(getSettings());
    void fetch('/api/ai').then((r) => r.json()).then((d) => setProvider(String(d.provider ?? 'local')));
  }, []);

  if (!s) return null;
  return (
    <>
      <TopNav />
      <main className="shell" style={{ maxWidth: 640 }}>
        <div className="page-head"><div><h1>Definições</h1><p>Configuração da conta e do motor de IA.</p></div></div>
        <div className="create-card">
          <div className="field"><label>Empresa</label><input value={s.company} onChange={(e) => setS({ ...s, company: e.target.value })} /></div>
          <div className="field"><label>Marca</label><input value={s.brand} onChange={(e) => setS({ ...s, brand: e.target.value })} /></div>
          <div className="field">
            <label>Motor de IA ativo</label>
            <input readOnly value={provider === 'local' ? 'Motor local (sem chaves)' : `Provider externo (${provider})`} />
            <small style={{ color: 'var(--dim)', fontSize: 11 }}>Para ligar um provider externo define AI_PROVIDER=http e AI_BASE_URL no .env.local.</small>
          </div>
          <button className="btn primary" onClick={() => { saveSettings(s); setSaved(true); setTimeout(() => setSaved(false), 2000); }}>Guardar</button>
          {saved && <span style={{ marginLeft: 10, color: 'var(--ok)', fontSize: 12 }}>✓ Guardado</span>}
        </div>
      </main>
    </>
  );
}
