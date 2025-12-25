/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: [
    'react-financial-charts',
    '@react-financial-charts/annotations',
    '@react-financial-charts/axes',
    '@react-financial-charts/coordinates',
    '@react-financial-charts/core',
    '@react-financial-charts/indicators',
    '@react-financial-charts/interactive',
    '@react-financial-charts/scales',
    '@react-financial-charts/series',
    '@react-financial-charts/tooltip',
    '@react-financial-charts/utils',
    'd3-array',
    'd3-format',
    'd3-time-format',
  ],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;