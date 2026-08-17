/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: false,
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'img.clerk.com' },
		],
	},
};

module.exports = nextConfig;
