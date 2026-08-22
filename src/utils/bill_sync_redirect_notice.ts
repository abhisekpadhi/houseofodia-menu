const SESSION_KEY = 'tangify:bill-sync-redirect';

/** Set before leaving /bill during sync catch-up. */
export function markBillSyncRedirect(): void {
	try {
		sessionStorage.setItem(SESSION_KEY, '1');
	} catch {
		// sessionStorage unavailable
	}
}

/** Read once and clear; true when bill redirect notice should be shown. */
export function consumeBillSyncRedirectNotice(): boolean {
	try {
		if (sessionStorage.getItem(SESSION_KEY) !== '1') {
			return false;
		}
		sessionStorage.removeItem(SESSION_KEY);
		return true;
	} catch {
		return false;
	}
}
