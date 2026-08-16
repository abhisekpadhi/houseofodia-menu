/**
 * Sync-first write gate: block order-ops publishes until catch-up completes.
 */

export type WriteGateState =
	| 'offline'
	| 'catching_up'
	| 'ready'
	| 'awaiting_choice';

export class SyncWriteBlockedError extends Error {
	constructor(message = 'Sync in progress — wait until catch-up finishes') {
		super(message);
		this.name = 'SyncWriteBlockedError';
	}
}

let gateState: WriteGateState = 'offline';
/** True when catch-up was triggered by reconnect / resume (prefer fullscreen). */
let preferFullscreenCatchUp = false;
let catchUpStartedAt = 0;

const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of Array.from(listeners)) {
		listener();
	}
}

export function getWriteGateState(): WriteGateState {
	return gateState;
}

export function isWriteGateReady(): boolean {
	return gateState === 'ready';
}

export function canPublishOrderOps(): boolean {
	return gateState === 'ready';
}

export function assertCanPublishOrderOps(): void {
	if (!canPublishOrderOps()) {
		throw new SyncWriteBlockedError();
	}
}

export function getPreferFullscreenCatchUp(): boolean {
	return preferFullscreenCatchUp;
}

export function getCatchUpStartedAt(): number {
	return catchUpStartedAt;
}

export function setWriteGateState(
	next: WriteGateState,
	options?: { fullscreen?: boolean }
): void {
	const prev = gateState;
	if (next === 'catching_up') {
		if (options?.fullscreen === true) {
			preferFullscreenCatchUp = true;
		}
		if (prev !== 'catching_up') {
			catchUpStartedAt = Date.now();
		}
	}
	if (next === 'ready' || next === 'offline') {
		preferFullscreenCatchUp = false;
		catchUpStartedAt = 0;
	}
	if (prev === next) {
		emit();
		return;
	}
	gateState = next;
	console.log(`[sync-gate] ${prev} → ${next}`);
	emit();
}

export function subscribeWriteGate(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
