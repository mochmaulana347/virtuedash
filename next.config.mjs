/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // "Diriku" diganti nama jadi "Pribadi" (2026-11-11) — link lama tetap jalan.
      { source: '/diriku', destination: '/pribadi', permanent: true },
    ];
  },
};
export default nextConfig;
