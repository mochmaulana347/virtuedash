'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';

/* Gelembung ambient: posisi/ukuran/kecepatan tetap (bukan random) supaya tidak
   ada hydration mismatch. Animasi murni CSS, di belakang konten, tidak
   menghalangi klik (pointer-events: none). */
const BUBBLES = [
  { x: '3%', s: 46, d: '38s', delay: '-6s', o: 0.1 },
  { x: '9%', s: 22, d: '30s', delay: '-18s', o: 0.12 },
  { x: '16%', s: 64, d: '46s', delay: '-30s', o: 0.07 },
  { x: '24%', s: 30, d: '34s', delay: '-10s', o: 0.11 },
  { x: '31%', s: 52, d: '42s', delay: '-24s', o: 0.08 },
  { x: '38%', s: 18, d: '28s', delay: '-4s', o: 0.13 },
  { x: '45%', s: 40, d: '36s', delay: '-14s', o: 0.09 },
  { x: '52%', s: 26, d: '32s', delay: '-22s', o: 0.12 },
  { x: '59%', s: 58, d: '48s', delay: '-36s', o: 0.07 },
  { x: '66%', s: 20, d: '29s', delay: '-8s', o: 0.13 },
  { x: '73%', s: 44, d: '40s', delay: '-28s', o: 0.09 },
  { x: '80%', s: 28, d: '33s', delay: '-16s', o: 0.11 },
  { x: '87%', s: 62, d: '50s', delay: '-40s', o: 0.07 },
  { x: '94%', s: 24, d: '31s', delay: '-12s', o: 0.12 },
];

export default function RootShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell">
      <div className="bubbles" aria-hidden="true">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="bubble"
            style={
              {
                '--x': b.x,
                '--s': `${b.s}px`,
                '--d': b.d,
                '--delay': b.delay,
                '--o': b.o,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="mobile-topbar">
        <button
          type="button"
          className="hamburger"
          onClick={() => setMenuOpen(true)}
          aria-label="Buka menu"
        >
          ☰
        </button>
        <span className="mobile-brand">VIRTUE</span>
      </div>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="app-main">{children}</main>
    </div>
  );
}
