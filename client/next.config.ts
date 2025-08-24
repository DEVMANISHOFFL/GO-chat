const nextConfig = {
  async rewrites() {
    return [{ source: '/api/chat/:path*', destination: 'http://localhost:8080/api/chat/:path*' }];
  },
};
module.exports = nextConfig;
