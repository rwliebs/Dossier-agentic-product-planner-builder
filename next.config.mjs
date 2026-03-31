/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopackUseSystemTlsCerts: true,
  typescript: {
    ignoreBuildErrors: false,
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
