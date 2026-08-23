import type { SyncResponseMessage } from '@/src/models/order_ops';

/** Ably message limit is 64KiB; stay under with envelope overhead. */
export const SYNC_MAX_CHUNK_BYTES = 52_000;

/** Per-chunk deadline while waiting for the next chunk (slow networks). */
export const SYNC_CHUNK_TIMEOUT_MS = 10_000;

/** Hard cap on total transfer wait time. */
export const SYNC_TRANSFER_MAX_MS = 120_000;

export type ChunkedSyncResponseMessage = {
	transferId: string;
	chunkIndex: number;
	totalChunks: number;
	chunkPayload: string;
	targetId: string;
	responderId: string;
};

export type SyncResponseWireMessage =
	| SyncResponseMessage
	| ChunkedSyncResponseMessage;

export type SyncTransferProgress = {
	received: number;
	total: number;
};

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}

function splitUtf8String(str: string, maxBytes: number): string[] {
	const chunks: string[] = [];
	let current = '';

	for (const char of str) {
		const candidate = current + char;
		if (utf8ByteLength(candidate) > maxBytes && current.length > 0) {
			chunks.push(current);
			current = char;
		} else {
			current = candidate;
		}
	}

	if (current.length > 0) {
		chunks.push(current);
	}

	return chunks.length > 0 ? chunks : [''];
}

export function isChunkedSyncMessage(
	message: SyncResponseWireMessage
): message is ChunkedSyncResponseMessage {
	return (
		'chunkPayload' in message &&
		typeof message.transferId === 'string' &&
		typeof message.totalChunks === 'number' &&
		message.totalChunks > 1 &&
		typeof message.chunkIndex === 'number' &&
		typeof message.chunkPayload === 'string'
	);
}

export function isCompleteSyncResponse(
	message: SyncResponseWireMessage
): message is SyncResponseMessage {
	if (isChunkedSyncMessage(message)) {
		return false;
	}
	return (
		typeof message.targetId === 'string' &&
		typeof message.responderId === 'string' &&
		typeof message.businessDate === 'string'
	);
}


export function splitSyncResponseForPublish(
	response: SyncResponseMessage
): SyncResponseWireMessage[] {
	const { targetId, responderId, ...snapshot } = response;
	const json = JSON.stringify(snapshot);
	if (utf8ByteLength(json) <= SYNC_MAX_CHUNK_BYTES) {
		return [response];
	}

	const transferId = `${responderId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
	const payloadChunks = splitUtf8String(json, SYNC_MAX_CHUNK_BYTES);
	const totalChunks = payloadChunks.length;

	return payloadChunks.map((chunkPayload, chunkIndex) => ({
		transferId,
		chunkIndex,
		totalChunks,
		targetId,
		responderId,
		chunkPayload,
	}));
}

type TransferBuffer = {
	parts: string[];
	totalChunks: number;
	targetId: string;
	responderId: string;
	received: Set<number>;
};

export class SyncResponseChunkAssembler {
	private buffers = new Map<string, TransferBuffer>();

	ingest(message: SyncResponseWireMessage): SyncResponseMessage | null {
		if (isCompleteSyncResponse(message)) {
			return message;
		}

		if (!isChunkedSyncMessage(message)) {
			return null;
		}

		const transferId = message.transferId!;
		let buffer = this.buffers.get(transferId);
		if (!buffer) {
			buffer = {
				parts: new Array(message.totalChunks!).fill(''),
				totalChunks: message.totalChunks!,
				targetId: message.targetId,
				responderId: message.responderId,
				received: new Set<number>(),
			};
			this.buffers.set(transferId, buffer);
		}

		if (
			buffer.totalChunks !== message.totalChunks ||
			buffer.targetId !== message.targetId ||
			buffer.responderId !== message.responderId
		) {
			return null;
		}

		if (buffer.received.has(message.chunkIndex!)) {
			return null;
		}

		buffer.parts[message.chunkIndex!] = message.chunkPayload!;
		buffer.received.add(message.chunkIndex!);

		if (buffer.received.size < buffer.totalChunks) {
			return null;
		}

		this.buffers.delete(transferId);

		try {
			const parsed = JSON.parse(buffer.parts.join('')) as Omit<
				SyncResponseMessage,
				'targetId' | 'responderId'
			>;
			return {
				...parsed,
				targetId: buffer.targetId,
				responderId: buffer.responderId,
			};
		} catch (error) {
			console.error('[sync-chunk] failed to parse reassembled payload', error);
			return null;
		}
	}

	getProgress(
		message: SyncResponseWireMessage
	): SyncTransferProgress | null {
		if (isCompleteSyncResponse(message)) {
			return { received: 1, total: 1 };
		}
		if (!isChunkedSyncMessage(message)) {
			return null;
		}

		const buffer = this.buffers.get(message.transferId!);
		return {
			received: buffer ? buffer.received.size : 0,
			total: message.totalChunks!,
		};
	}

	abort(transferId?: string): void {
		if (transferId) {
			this.buffers.delete(transferId);
			return;
		}
		this.buffers.clear();
	}
}

export async function publishSyncResponseChunks(
	publish: (payload: SyncResponseWireMessage) => Promise<void>,
	response: SyncResponseMessage
): Promise<number> {
	const messages = splitSyncResponseForPublish(response);
	for (const message of messages) {
		await publish(message);
	}
	return messages.length > 1 && 'totalChunks' in messages[0]
		? messages[0].totalChunks
		: 1;
}
