/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: false,
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'img.clerk.com' },
		],
	},
	experimental: {
		missingSuspenseWithCSRBailout: false,
	},
};

module.exports = nextConfig;
