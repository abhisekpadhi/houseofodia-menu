'use client';

import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from 'react';

const LateClockContext = createContext(0);

export function LateClockProvider({ children }: { children: ReactNode }) {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNow(Date.now());
		}, 15_000);
		return () => window.clearInterval(interval);
	}, []);

	return (
		<LateClockContext.Provider value={now}>{children}</LateClockContext.Provider>
	);
}

export function useLateClock(): number {
	return useContext(LateClockContext);
}
