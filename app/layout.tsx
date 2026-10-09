import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Landing AI',
  description: 'Plataforma IA-first para criar, editar e publicar Landing Pages com um agente de IA.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Webfonts de nível editorial — carregadas uma vez, aplicadas por tema (LP_FONTS).
const FONT_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=Space+Grotesk:wght@400;500;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&' +
  'family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=JetBrains+Mono:wght@400;700&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_URL} />
      </head>
      <body>{children}</body>
    </html>
  );
}
