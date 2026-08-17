'use client';

import { useCallback, useRef } from 'react';

/**
 * Sync lock so a second tap cannot start another persist before React re-renders.
 * Stay locked after a successful navigate-away; call unlock() on error or when
 * the user should be able to tap again.
 */
export function useInFlightLock() {
	const lockedRef = useRef(false);

	const tryLock = useCallback((): boolean => {
		if (lockedRef.current) {
			return false;
		}
		lockedRef.current = true;
		return true;
	}, []);

	const unlock = useCallback(() => {
		lockedRef.current = false;
	}, []);

	const runLocked = useCallback(
		async (action: () => Promise<void>) => {
			if (!tryLock()) {
				return;
			}
			try {
				await action();
			} finally {
				unlock();
			}
		},
		[tryLock, unlock]
	);

	return { tryLock, unlock, runLocked };
}
