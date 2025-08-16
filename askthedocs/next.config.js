// next.config.js - Use module.exports (CommonJS)
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'lh3.googleusercontent.com', // Google profile images
      'avatars.githubusercontent.com', // GitHub profile images
    ],
  },
};

module.exports = nextConfig; // CommonJS style
