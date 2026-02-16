/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repo has multiple lockfiles (backend + frontend). Force Next/Turbopack
  // to treat `frontend/` as the project root to avoid type generation conflicts.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

