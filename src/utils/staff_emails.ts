const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const MAX_EMAILS = 50;

export function isValidEmail(email: string): boolean {
	return EMAIL_PATTERN.test(email.trim());
}

export type ParsedEmailLines = {
	emails: string[];
	error?: string;
};

export function parseEmailLines(input: unknown): ParsedEmailLines {
	const text =
		typeof input === 'string'
			? input
			: Array.isArray(input)
				? input.map((value) => String(value)).join('\n')
				: '';

	const lines = text.split(/\r?\n/);
	const unique = new Set<string>();
	const emails: string[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line) {
			continue;
		}

		if (/[,;\s]/.test(line) || !isValidEmail(line)) {
			return {
				emails: [],
				error: `Invalid email on line ${index + 1}: ${line}`,
			};
		}

		const email = line.toLowerCase();
		if (!unique.has(email)) {
			unique.add(email);
			emails.push(email);
		}
	}

	if (emails.length === 0) {
		return { emails: [], error: 'Enter at least one email address.' };
	}

	if (emails.length > MAX_EMAILS) {
		return {
			emails: [],
			error: `Enter at most ${MAX_EMAILS} email addresses.`,
		};
	}

	return { emails };
}
