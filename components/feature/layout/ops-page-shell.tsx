'use client';

import { TouchIconButton } from '@/components/ui/touch-controls';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

function BackIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden
		>
			<path d="m15 18-6-6 6-6" />
		</svg>
	);
}

type OpsPageShellProps = {
	title: string;
	titleIcon?: ReactNode;
	backHref?: string;
	trailing?: ReactNode;
	headerExtra?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
};

export function OpsPageShell({
	title,
	titleIcon,
	backHref = '/order',
	trailing,
	headerExtra,
	children,
	footer,
}: OpsPageShellProps) {
	const router = useRouter();

	return (
		<div className="ops-app-screen">
			<header className="ops-sticky-header bg-white border-b px-4 sm:px-6">
				<div className="flex items-center justify-between gap-2 py-3 min-h-[56px]">
					<TouchIconButton
						onClick={() => router.push(backHref)}
						ariaLabel="Back to orders"
						className="text-gray-700 active:bg-gray-100 -ml-1 shrink-0"
					>
						<BackIcon className="w-5 h-5" />
					</TouchIconButton>
					<h1 className="text-lg font-bold flex items-center justify-center gap-2 truncate flex-1 px-1">
						{titleIcon}
						<span className="truncate">{title}</span>
					</h1>
					<div className="flex items-center gap-1 shrink-0 justify-end min-w-[44px]">
						{trailing}
					</div>
				</div>
				{headerExtra}
			</header>
			<main className="ops-page-content px-4 sm:px-6 pt-4">{children}</main>
			{footer}
		</div>
	);
}
