'use client';

import type { ReactNode } from 'react';

export function LoadingSpinner({ className }: { className?: string }) {
	return (
		<span
			className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin opacity-80 ${className ?? 'h-4 w-4'}`}
			aria-hidden
		/>
	);
}

type TouchCheckboxProps = {
	checked: boolean;
	disabled?: boolean;
	loading?: boolean;
	label: string;
	hint?: string;
	onPress: () => void;
};

export function TouchCheckbox({
	checked,
	disabled = false,
	loading = false,
	label,
	hint,
	onPress,
}: TouchCheckboxProps) {
	const inactive = disabled && !loading;

	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			aria-busy={loading}
			disabled={inactive}
			onClick={onPress}
			title={hint}
			className={`mb-2 flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left touch-manipulation transition-colors ${
				inactive
					? 'cursor-not-allowed opacity-60'
					: 'cursor-pointer active:bg-gray-100'
			} ${checked ? 'text-green-700' : 'text-gray-700'}`}
		>
			<span
				className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
					checked
						? 'border-green-600 bg-green-600 text-white'
						: 'border-gray-300 bg-white text-transparent'
				}`}
			>
				{loading ? (
					<LoadingSpinner className="h-4 w-4 text-white" />
				) : checked ? (
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="3"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="h-4 w-4"
						aria-hidden
					>
						<path d="M20 6 9 17l-5-5" />
					</svg>
				) : null}
			</span>
			<span className="text-sm font-medium">{label}</span>
		</button>
	);
}

type TouchIconButtonProps = {
	onClick: () => void;
	loading?: boolean;
	disabled?: boolean;
	ariaLabel: string;
	className?: string;
	children: ReactNode;
};

export function TouchIconButton({
	onClick,
	loading = false,
	disabled = false,
	ariaLabel,
	className = '',
	children,
}: TouchIconButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled && !loading}
			aria-label={ariaLabel}
			aria-busy={loading}
			className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full touch-manipulation transition-colors ${className}`}
		>
			{loading ? <LoadingSpinner className="h-5 w-5" /> : children}
		</button>
	);
}

type TouchActionButtonProps = {
	onClick: () => void;
	loading?: boolean;
	disabled?: boolean;
	children: ReactNode;
	className?: string;
};

export function TouchActionButton({
	onClick,
	loading = false,
	disabled = false,
	children,
	className = '',
}: TouchActionButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled && !loading}
			aria-busy={loading}
			className={`inline-flex min-h-[44px] items-center justify-center px-3 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${className}`}
		>
			{loading ? <LoadingSpinner className="h-4 w-4" /> : children}
		</button>
	);
}

type ConfirmModalActionsProps = {
	onCancel: () => void;
	onConfirm: () => void;
	confirmLabel: string;
	confirming?: boolean;
	cancelDisabled?: boolean;
	confirmDisabled?: boolean;
};

export function ConfirmModalActions({
	onCancel,
	onConfirm,
	confirmLabel,
	confirming = false,
	cancelDisabled = false,
	confirmDisabled = false,
}: ConfirmModalActionsProps) {
	return (
		<div className="flex gap-2 p-4">
			<button
				type="button"
				onClick={onCancel}
				disabled={cancelDisabled || confirming}
				className="flex-1 min-h-[44px] rounded-lg bg-gray-100 border border-gray-300 text-sm font-semibold touch-manipulation active:bg-gray-200 disabled:opacity-60"
			>
				Cancel
			</button>
			<button
				type="button"
				onClick={onConfirm}
				disabled={confirming || confirmDisabled}
				aria-busy={confirming}
				className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-lg bg-green-500 text-white text-sm font-semibold touch-manipulation active:bg-green-600 disabled:opacity-60"
			>
				{confirming ? <LoadingSpinner className="h-4 w-4 text-white" /> : confirmLabel}
			</button>
		</div>
	);
}
