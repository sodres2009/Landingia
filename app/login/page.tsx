'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, tokenStore } from '@/lib/api';

/** Entrar / registar — a conta é o dono das páginas, dos leads e (em breve) das chaves CRM. */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const res = mode === 'login' ? await api.login({ email, password }) : await api.register({ email, password, name });
      tokenStore.set(res.token);
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ maxWidth: 460, paddingTop: 60 }}>
      <div className="create-card">
        <span className="spark">✦ A TUA CONTA</span>
        <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="intro">{mode === 'login' ? 'As tuas páginas e leads vivem na tua conta.' : 'Uma conta para as tuas páginas, leads e integrações.'}</p>

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.pt" autoFocus />
        </div>
        {mode === 'register' && (
          <div className="field">
            <label>Nome (opcional)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="O teu nome ou empresa" />
          </div>
        )}
        <div className="field">
          <label>Palavra-passe {mode === 'register' && '(mín. 8 caracteres)'}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="btn primary" style={{ width: '100%' }} onClick={() => void submit()} disabled={busy || !email || !password}>
          {busy ? '⏳ A validar…' : mode === 'login' ? 'Entrar' : 'Registar e entrar'}
        </button>

        <p className="intro" style={{ marginTop: 14, textAlign: 'center' }}>
          {mode === 'login' ? (
            <>Ainda não tens conta? <button className="btn ghost small" onClick={() => setMode('register')}>Regista-te</button></>
          ) : (
            <>Já tens conta? <button className="btn ghost small" onClick={() => setMode('login')}>Entra</button></>
          )}
        </p>
        <p className="intro" style={{ textAlign: 'center' }}><Link href="/">← Voltar</Link> · <Link href="/legal">Termos e privacidade</Link></p>
      </div>
    </main>
  );
}
