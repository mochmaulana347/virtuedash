'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Overview', sub: 'Dashboard' },
  { href: '/garapan', label: 'Garapan', sub: 'Aktivitas' },
  { href: '/aset', label: 'Aset', sub: 'Wallet' },
  { href: '/proyek', label: 'Proyek', sub: 'Per proyek' },
  { href: '/pasar', label: 'Pasar', sub: 'Harga pangan' },
  { href: '/berita', label: 'Berita', sub: 'Headline' },
  { href: '/pribadi', label: 'Pribadi', sub: 'Monitoring' },
  { href: '/laporan', label: 'Laporan', sub: 'P/L' },
  { href: '/pengaturan', label: 'Pengaturan', sub: 'Pengaturan' },
  { href: '/keuangan', label: 'Keuangan', sub: 'Aset & P/L' },
];

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
  return (
    <>
      {open && <div className="side-overlay" onClick={onClose} aria-hidden="true" />}
      <aside className={`app-sidebar${open ? ' open' : ''}`} aria-label="Navigasi utama">
        <div className="side-brand">
          <div className="side-logo">V</div>
          <div>
            <div className="side-name">VIRTUE</div>
            <div className="side-sub">DASHBOARD</div>
          </div>
          <button type="button" className="side-close" onClick={onClose} aria-label="Tutup menu">
            ✕
          </button>
        </div>
        <nav className="side-nav">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              onClick={onClose}
              className={`nav-link${isActive(t.href) ? ' active' : ''}`}
            >
              <span className="nav-label">{t.label}</span>
              <span className="nav-sub">{t.sub}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-wallet">0xC905…3903</div>
          <div className="side-meta">BSC · ELYSIUM</div>
        </div>
      </aside>
    </>
  );
}
