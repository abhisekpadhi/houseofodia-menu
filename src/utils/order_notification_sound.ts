let audioContext: AudioContext | null = null;
let bellIntervalId: ReturnType<typeof setInterval> | null = null;
let bellStopTimeoutId: ReturnType<typeof setTimeout> | null = null;

const BELL_DURATION_MS = 15_000;
const CHIME_INTERVAL_MS = 2_000;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') {
		return null;
	}

	const AudioContextClass =
		window.AudioContext ||
		(window as Window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;

	if (!AudioContextClass) {
		return null;
	}

	if (!audioContext) {
		audioContext = new AudioContextClass();
	}

	return audioContext;
}

async function ensureRunningAudioContext(): Promise<AudioContext | null> {
	const ctx = getAudioContext();
	if (!ctx) {
		return null;
	}

	if (ctx.state === 'closed') {
		audioContext = null;
		return ensureRunningAudioContext();
	}

	if (ctx.state === 'suspended') {
		try {
			await ctx.resume();
		} catch {
			return null;
		}
	}

	return ctx.state === 'running' ? ctx : null;
}

export function unlockOrderNotificationAudio(): void {
	void ensureRunningAudioContext();
}

function stopBellLoop(): void {
	if (bellIntervalId) {
		clearInterval(bellIntervalId);
		bellIntervalId = null;
	}
	if (bellStopTimeoutId) {
		clearTimeout(bellStopTimeoutId);
		bellStopTimeoutId = null;
	}
}

function playSingleChime(ctx: AudioContext): void {
	const now = ctx.currentTime;
	const masterGain = ctx.createGain();
	masterGain.connect(ctx.destination);
	masterGain.gain.setValueAtTime(0.0001, now);
	masterGain.gain.exponentialRampToValueAtTime(0.35, now + 0.015);
	masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

	const tones = [
		{ frequency: 880, delay: 0, duration: 0.55 },
		{ frequency: 1174.66, delay: 0.12, duration: 0.7 },
		{ frequency: 1318.51, delay: 0.28, duration: 0.85 },
	];

	for (const tone of tones) {
		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();
		const toneStart = now + tone.delay;

		oscillator.type = 'sine';
		oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
		gain.gain.setValueAtTime(0.0001, toneStart);
		gain.gain.exponentialRampToValueAtTime(0.5, toneStart + 0.02);
		gain.gain.exponentialRampToValueAtTime(
			0.0001,
			toneStart + tone.duration
		);
		oscillator.connect(gain);
		gain.connect(masterGain);
		oscillator.start(toneStart);
		oscillator.stop(toneStart + tone.duration + 0.05);
	}
}

export async function playNewOrderBell(): Promise<void> {
	stopBellLoop();

	const ctx = await ensureRunningAudioContext();
	if (!ctx) {
		return;
	}

	playSingleChime(ctx);

	bellIntervalId = setInterval(() => {
		void ensureRunningAudioContext().then((activeCtx) => {
			if (activeCtx) {
				playSingleChime(activeCtx);
			}
		});
	}, CHIME_INTERVAL_MS);

	bellStopTimeoutId = setTimeout(() => {
		stopBellLoop();
	}, BELL_DURATION_MS);
}
