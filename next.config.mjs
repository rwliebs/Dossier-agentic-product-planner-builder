/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopackUseSystemTlsCerts: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    "better-sqlite3",
    "ruvector-core",
  ],
}

export default nextConfig
