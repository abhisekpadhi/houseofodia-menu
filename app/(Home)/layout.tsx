import '../globals.css';

import { Inter, Niconne, DM_Sans } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import clsx from 'clsx';

const inter = Inter({ subsets: ['latin'] });
const dmSans = DM_Sans({ subsets: ['latin'] });

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	viewportFit: 'cover',
	themeColor: '#000000',
};

export const metadata: Metadata = {
	title: 'Tangify',
	description: 'Tangify - Restaurant orders, inventory, and billing',
	manifest: '/manifest.webmanifest',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Tangify',
	},
	icons: {
		icon: [
			{ url: '/icons/icon-48x48.png', sizes: '48x48', type: 'image/png' },
			{ url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
			{ url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
		],
		apple: [
			{ url: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
			{ url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
		],
	},
	other: {
		'mobile-web-app-capable': 'yes',
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className="h-full">
			<body
				className={clsx(
					inter.className,
					dmSans.className,
					'bg-background h-full antialiased'
				)}
			>
				{children}
			</body>
		</html>
	);
}
