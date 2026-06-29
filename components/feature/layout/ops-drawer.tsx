'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';

type OpsDrawerContextValue = {
	open: boolean;
	openDrawer: () => void;
	closeDrawer: () => void;
};

const OpsDrawerContext = createContext<OpsDrawerContextValue | null>(null);

export function useOpsDrawer() {
	const context = useContext(OpsDrawerContext);
	if (!context) {
		throw new Error('useOpsDrawer must be used within OpsDrawerProvider');
	}
	return context;
}

function MenuIcon({ className }: { className?: string }) {
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
			<path d="M4 5h16" />
			<path d="M4 12h16" />
			<path d="M4 19h16" />
		</svg>
	);
}

function CloseIcon({ className }: { className?: string }) {
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
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

const DRAWER_LINKS = [
	{ href: '/order/inventory', label: 'Dish inventory' },
	{ href: '/freeflow', label: 'Old bill' },
	{ href: '/order/history', label: "Today's order history" },
	{ href: '/order/day-open', label: 'Day open' },
	{ href: '/order/day-close', label: 'Day close' },
	{ href: '/order/utensils', label: 'Utensils inventory' },
	{ href: '/order/tableware', label: 'Tableware inventory' },
	{ href: '/order/raw-materials', label: 'Raw material inventory' },
	{ href: '/order/menu-sop', label: 'Menu SOP' },
	{ href: '/order/waitlist', label: 'Waiting list' },
] as const;

export function OpsDrawerProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	const openDrawer = useCallback(() => setOpen(true), []);
	const closeDrawer = useCallback(() => setOpen(false), []);

	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeDrawer();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [open, closeDrawer]);

	return (
		<OpsDrawerContext.Provider value={{ open, openDrawer, closeDrawer }}>
			{children}
			{open ? (
				<div className="fixed inset-0 z-[60] flex">
					<button
						type="button"
						className="absolute inset-0 bg-black/40"
						onClick={closeDrawer}
						aria-label="Close menu"
					/>
					<aside className="relative w-[min(18rem,85vw)] max-w-full h-full bg-white shadow-xl flex flex-col pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[env(safe-area-inset-bottom)]">
						<div className="flex items-center justify-between px-4 py-3 border-b">
							<h2 className="text-lg font-bold">Menu</h2>
							<button
								type="button"
								onClick={closeDrawer}
								className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 touch-manipulation"
								aria-label="Close menu"
							>
								<CloseIcon className="w-5 h-5" />
							</button>
						</div>
						<nav className="flex-1 overflow-y-auto py-2">
							<ul>
								{DRAWER_LINKS.map((link) => {
									const active = pathname === link.href;
									return (
										<li key={link.href}>
											<Link
												href={link.href}
												onClick={closeDrawer}
												className={`block px-4 py-3 text-sm font-semibold touch-manipulation ${
													active
														? 'bg-green-50 text-green-800 border-r-4 border-green-600'
														: 'text-gray-800 hover:bg-gray-50 active:bg-gray-100'
												}`}
											>
												{link.label}
											</Link>
										</li>
									);
								})}
							</ul>
						</nav>
						<div className="border-t px-4 py-3">
							<Link
								href="/order"
								onClick={closeDrawer}
								className="block text-center min-h-[44px] leading-[44px] rounded-lg bg-gray-100 text-sm font-semibold text-gray-800 hover:bg-gray-200 touch-manipulation"
							>
								Back to orders
							</Link>
						</div>
					</aside>
				</div>
			) : null}
		</OpsDrawerContext.Provider>
	);
}

export function OpsMenuButton({
	className = '',
}: {
	className?: string;
}) {
	const context = useContext(OpsDrawerContext);
	if (!context) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={context.openDrawer}
			className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-200/80 shadow-md touch-manipulation shrink-0 ${className}`}
			aria-label="Open menu"
		>
			<MenuIcon className="w-5 h-5" />
		</button>
	);
}
