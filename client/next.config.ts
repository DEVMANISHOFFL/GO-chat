const nextConfig = {
  async rewrites() {
    return [{ source: '/api/chat/:path*', destination: 'http://localhost:8080/api/chat/:path*' }];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};
module.exports = nextConfig;
