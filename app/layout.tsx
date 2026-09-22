import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Landing AI',
  description: 'Plataforma IA-first para criar, editar e publicar Landing Pages com um agente de IA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
