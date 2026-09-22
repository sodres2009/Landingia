'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import { getBookings } from '@/lib/storage';
import type { Booking } from '@/lib/types';

export default function BookingsPage() {
  const [rows, setRows] = useState<Booking[] | null>(null);
  useEffect(() => setRows(getBookings()), []);

  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head">
          <div>
            <h1>Agendamento</h1>
            <p>Marcações feitas pelos elementos de agendamento das páginas.</p>
          </div>
        </div>
        {!rows ? null : rows.length === 0 ? (
          <div className="empty"><h2>Sem agendamentos</h2><p>Adiciona um elemento de Agendamento a uma página para começar a receber marcações.</p></div>
        ) : (
          <table className="table">
            <thead><tr><th>Nome</th><th>Email</th><th>Data</th><th>Hora</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b></td><td>{b.email}</td>
                  <td>{new Date(`${b.date}T00:00`).toLocaleDateString('pt-PT')}</td>
                  <td>{b.time}</td>
                  <td><span className="badge published">{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
