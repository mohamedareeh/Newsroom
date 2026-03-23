/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js", "sharp", "canvas", "puppeteer"],
  },
};

module.exports = nextConfig;
