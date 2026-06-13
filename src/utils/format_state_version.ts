function formatRelativePast(fromMs: number, now = Date.now()): string {
	const diffMs = Math.max(0, now - fromMs);
	const seconds = Math.floor(diffMs / 1000);

	if (seconds < 45) {
		return 'just now';
	}

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes} min ago`;
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
	}

	const days = Math.floor(hours / 24);
	return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Display-only label for order_ops stateVersion (epoch ms). */
export function formatStateVersionDisplay(
	version: number | null | undefined,
	now = Date.now()
): string {
	if (version == null) {
		return '—';
	}

	if (version === 0) {
		return 'Not synced yet';
	}

	const date = new Date(version);
	if (Number.isNaN(date.getTime())) {
		return String(version);
	}

	const time = date.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});

	return `${time} · ${formatRelativePast(version, now)}`;
}
