import type { Metadata } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import RootShell from './RootShell';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dashboard Virtue — Garapan',
  description: 'Semua modal, hasil dan untung rugi, terverifikasi on-chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
