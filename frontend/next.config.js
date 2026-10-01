/** Dev: proxy /api to Express. Production: Nginx does this (see deploy/nginx.conf). */
module.exports = {
  experimental: { externalDir: true }, // allow importing ../shared
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' }];
  },
};
