/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Explicitly NOT configuring turbopack to avoid defaults?
    // Actually, standard config without 'turbopack' key should be enough.
};

module.exports = nextConfig;
