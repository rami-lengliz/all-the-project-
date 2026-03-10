/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    // Proxy /api/* → NestJS backend on port 3001
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:3001/api/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
