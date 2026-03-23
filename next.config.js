/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@resvg/resvg-js", "sharp", "canvas", "puppeteer", "puppeteer-core", "@sparticuz/chromium"],
  },
};

module.exports = nextConfig;
