/** @type {import('next').NextConfig} */
const nextConfig = {
  // Reine Browser-App: statischer Export, kein Server nötig.
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
