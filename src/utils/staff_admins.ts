export const ADMIN_EMAILS = [
	'avicool000@gmail.com',
	'imohapatra1995@gmail.com',
] as const;

const ADMIN_EMAIL_SET = new Set(
	ADMIN_EMAILS.map((email) => email.toLowerCase())
);

export function isAdminEmail(email: string | null | undefined): boolean {
	if (!email) {
		return false;
	}
	return ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
}

export function hasAdminEmail(
	emails: Array<string | null | undefined>
): boolean {
	return emails.some(isAdminEmail);
}
