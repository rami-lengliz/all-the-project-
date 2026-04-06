/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    // Proxy /api/* → NestJS backend
    // In production (Vercel): set NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app
    // In local dev: falls back to localhost:3001
    async rewrites() {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        return [
            {
                source: '/api/:path*',
                destination: `${apiBase}/api/:path*`,
            },
            {
                // Proxy uploaded images from NestJS backend static file server
                source: '/uploads/:path*',
                destination: `${apiBase}/uploads/:path*`,
            },
        ];
    },
};

module.exports = nextConfig;
