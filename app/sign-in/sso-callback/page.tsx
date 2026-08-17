'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

const UNAUTHORIZED_PATH = '/sign-in?error=unauthorized';
const SUCCESS_PATH = '/order';

export default function SignInSsoCallbackPage() {
	const clerk = useClerk();
	const { isSignedIn, isLoaded: authLoaded } = useAuth();
	const started = useRef(false);
	const left = useRef(false);

	const leave = (path: string) => {
		if (left.current) {
			return;
		}
		left.current = true;
		window.location.replace(path);
	};

	useEffect(() => {
		if (authLoaded && isSignedIn) {
			leave(SUCCESS_PATH);
		}
	}, [authLoaded, isSignedIn]);

	useEffect(() => {
		if (!clerk.loaded || isSignedIn || left.current) {
			return;
		}
		const timeout = window.setTimeout(() => {
			leave(UNAUTHORIZED_PATH);
		}, 1500);
		return () => window.clearTimeout(timeout);
	}, [clerk.loaded, isSignedIn]);

	useEffect(() => {
		if (!clerk.loaded || started.current) {
			return;
		}
		started.current = true;

		void clerk
			.handleRedirectCallback(
				{
					transferable: false,
					signInUrl: UNAUTHORIZED_PATH,
					signUpUrl: UNAUTHORIZED_PATH,
					continueSignUpUrl: UNAUTHORIZED_PATH,
					firstFactorUrl: UNAUTHORIZED_PATH,
					secondFactorUrl: UNAUTHORIZED_PATH,
					resetPasswordUrl: UNAUTHORIZED_PATH,
					verifyEmailAddressUrl: UNAUTHORIZED_PATH,
					verifyPhoneNumberUrl: UNAUTHORIZED_PATH,
				},
				async (to) => {
					const target = String(to);
					if (target.includes('/order')) {
						leave(SUCCESS_PATH);
						return;
					}
					leave(UNAUTHORIZED_PATH);
				}
			)
			.catch(() => {
				leave(UNAUTHORIZED_PATH);
			});
	}, [clerk]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
			<div id="clerk-captcha" />
			<p className="text-sm font-medium text-gray-600">Signing in…</p>
		</div>
	);
}
