'use client';

import { LoadingSpinner } from '@/components/ui/touch-controls';
import { useAuth, useSignIn } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, ReactNode, Suspense, useState } from 'react';

function clerkErrorMessage(error: unknown, fallback: string): string {
	if (!error || typeof error !== 'object' || !('errors' in error)) {
		return fallback;
	}
	const errors = (error as { errors?: unknown }).errors;
	if (!Array.isArray(errors) || errors.length === 0) {
		return fallback;
	}
	const first = errors[0];
	if (!first || typeof first !== 'object') {
		return fallback;
	}
	const record = first as { longMessage?: unknown; message?: unknown; code?: unknown };
	const code = typeof record.code === 'string' ? record.code : '';
	if (
		code === 'form_identifier_not_found' ||
		code === 'identifier_not_found' ||
		code === 'form_identifier_not_found_code'
	) {
		return 'This email is not allowed to sign in.';
	}
	if (typeof record.longMessage === 'string' && record.longMessage.trim()) {
		return record.longMessage;
	}
	if (typeof record.message === 'string' && record.message.trim()) {
		return record.message;
	}
	return fallback;
}

const fieldClassName =
	'min-h-[52px] w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 shadow-sm outline-none focus:border-gray-900';
const primaryButtonClassName =
	'inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-black px-4 text-base font-bold text-white shadow-sm touch-manipulation active:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60';

function SignInShell({
	subtitle,
	children,
}: {
	subtitle: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-dvh flex-col bg-neutral-50 px-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(3rem,calc(env(safe-area-inset-top)+1.5rem))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:pt-[max(2rem,env(safe-area-inset-top))]">
			<div className="mx-auto w-full max-w-sm">
				<h1 className="text-3xl font-bold text-gray-900">Tangify</h1>
				<p className="mt-1 mb-8 text-base text-gray-500">{subtitle}</p>
				{children}
			</div>
		</div>
	);
}

export default function SignInPage() {
	return (
		<Suspense>
			<SignInContent />
		</Suspense>
	);
}

function SignInContent() {
	const { isSignedIn, isLoaded: authLoaded } = useAuth();
	const { signIn, setActive, isLoaded } = useSignIn();
	const router = useRouter();
	const searchParams = useSearchParams();
	const [email, setEmail] = useState('');
	const [code, setCode] = useState('');
	const [step, setStep] = useState<'email' | 'code'>('email');
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(
		searchParams.get('error') === 'unauthorized'
			? 'This email is not allowed to sign in.'
			: null
	);

	const sendCode = async (event?: FormEvent) => {
		event?.preventDefault();
		if (!isLoaded || !signIn || pending) {
			return;
		}
		const identifier = email.trim().toLowerCase();
		if (!identifier) {
			setError('Enter your staff email.');
			return;
		}
		setPending(true);
		setError(null);
		try {
			const created = await signIn.create({ identifier });
			const emailFactor = created.supportedFirstFactors?.find(
				(factor) => factor.strategy === 'email_code'
			);
			if (!emailFactor || emailFactor.strategy !== 'email_code') {
				setError('This email is not allowed to sign in.');
				return;
			}
			await signIn.prepareFirstFactor({
				strategy: 'email_code',
				emailAddressId: emailFactor.emailAddressId,
			});
			setCode('');
			setStep('code');
		} catch (cause) {
			setError(clerkErrorMessage(cause, 'Could not send a code. Try again.'));
		} finally {
			setPending(false);
		}
	};

	const verifyCode = async (event: FormEvent) => {
		event.preventDefault();
		if (!isLoaded || !signIn || !setActive || pending) {
			return;
		}
		const otp = code.trim();
		if (!otp) {
			setError('Enter the code from your email.');
			return;
		}
		setPending(true);
		setError(null);
		try {
			const result = await signIn.attemptFirstFactor({
				strategy: 'email_code',
				code: otp,
			});
			if (result.status === 'complete' && result.createdSessionId) {
				await setActive({ session: result.createdSessionId });
				router.replace('/order');
				return;
			}
			setError('Could not verify that code. Try again.');
		} catch (cause) {
			setError(clerkErrorMessage(cause, 'Invalid code. Try again.'));
		} finally {
			setPending(false);
		}
	};

	if (authLoaded && isSignedIn) {
		return (
			<SignInShell subtitle="You are already signed in">
				<button
					type="button"
					onClick={() => router.push('/order')}
					className={primaryButtonClassName}
				>
					Go to orders
				</button>
			</SignInShell>
		);
	}

	return (
		<SignInShell subtitle="Staff sign in">
			<div id="clerk-captcha" />
			{step === 'email' ? (
				<form
					onSubmit={(event) => void sendCode(event)}
					className="flex flex-col gap-4"
				>
					<label htmlFor="staff-email" className="text-sm font-semibold text-gray-700">
						Email
					</label>
					<input
						id="staff-email"
						type="email"
						autoComplete="email"
						inputMode="email"
						enterKeyHint="send"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						autoFocus
						value={email}
						onChange={(event) => {
							setEmail(event.target.value);
							if (error) {
								setError(null);
							}
						}}
						placeholder="you@example.com"
						className={fieldClassName}
					/>
					<button
						type="submit"
						disabled={!isLoaded || pending}
						className={primaryButtonClassName}
					>
						{pending ? (
							<LoadingSpinner className="h-5 w-5 text-white" />
						) : (
							'Send code'
						)}
					</button>
				</form>
			) : (
				<form
					onSubmit={(event) => void verifyCode(event)}
					className="flex flex-col gap-4"
				>
					<p className="text-base text-gray-600">
						Enter the code sent to{' '}
						<span className="font-semibold break-all text-gray-900">
							{email.trim()}
						</span>
					</p>
					<label htmlFor="email-code" className="text-sm font-semibold text-gray-700">
						Verification code
					</label>
					<input
						id="email-code"
						type="text"
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={6}
						autoComplete="one-time-code"
						enterKeyHint="done"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						autoFocus
						value={code}
						onChange={(event) => {
							setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
							if (error) {
								setError(null);
							}
						}}
						placeholder="123456"
						className={`${fieldClassName} text-center text-xl tracking-[0.4em]`}
					/>
					<button
						type="submit"
						disabled={!isLoaded || pending || code.length < 6}
						className={primaryButtonClassName}
					>
						{pending ? (
							<LoadingSpinner className="h-5 w-5 text-white" />
						) : (
							'Verify and sign in'
						)}
					</button>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							disabled={pending}
							onClick={() => {
								setStep('email');
								setCode('');
								setError(null);
							}}
							className="inline-flex min-h-[44px] items-center justify-center rounded-xl text-base font-semibold text-gray-700 touch-manipulation active:bg-gray-100 disabled:opacity-60"
						>
							Change email
						</button>
						<button
							type="button"
							disabled={pending}
							onClick={() => void sendCode()}
							className="inline-flex min-h-[44px] items-center justify-center rounded-xl text-base font-semibold text-gray-700 touch-manipulation active:bg-gray-100 disabled:opacity-60"
						>
							Resend code
						</button>
					</div>
				</form>
			)}

			{error ? (
				<p className="mt-4 text-base font-medium text-red-600">{error}</p>
			) : null}
		</SignInShell>
	);
}
