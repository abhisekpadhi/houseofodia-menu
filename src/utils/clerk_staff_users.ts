import { isAdminEmail } from '@/src/utils/staff_admins';
import { parseEmailLines } from '@/src/utils/staff_emails';
import { clerkClient } from '@clerk/nextjs/server';

export type StaffUserAction = 'add' | 'remove';

function isProtectedEmail(email: string): boolean {
	return isAdminEmail(email);
}

function clerkErrorStatus(error: unknown): number | undefined {
	if (!error || typeof error !== 'object' || !('status' in error)) {
		return undefined;
	}
	const status = Number((error as { status?: unknown }).status);
	return Number.isFinite(status) ? status : undefined;
}

function clerkErrorCodes(error: unknown): string[] {
	if (!error || typeof error !== 'object' || !('errors' in error)) {
		return [];
	}
	const errors = (error as { errors?: unknown }).errors;
	if (!Array.isArray(errors)) {
		return [];
	}
	return errors
		.map((item) =>
			item && typeof item === 'object' && 'code' in item
				? String((item as { code?: unknown }).code ?? '')
				: ''
		)
		.filter(Boolean);
}

function isDuplicateUserError(error: unknown): boolean {
	if (clerkErrorStatus(error) === 422) {
		return true;
	}
	return clerkErrorCodes(error).some(
		(code) =>
			code === 'form_identifier_exists' || code === 'duplicate_record'
	);
}

export async function applyStaffUserAction(
	action: StaffUserAction,
	input: unknown
): Promise<{ error?: string }> {
	if (action !== 'add' && action !== 'remove') {
		return { error: 'Choose add or remove.' };
	}

	const parsed = parseEmailLines(input);
	if (parsed.error) {
		return { error: parsed.error };
	}

	const emails = parsed.emails;
	const client = await clerkClient();

	if (action === 'add') {
		for (const email of emails) {
			try {
				await client.users.createUser({
					emailAddress: [email],
					skipPasswordRequirement: true,
				});
			} catch (error) {
				if (isDuplicateUserError(error)) {
					continue;
				}
				throw error;
			}
		}
		return {};
	}

	for (const email of emails) {
		if (isProtectedEmail(email)) {
			continue;
		}

		const result = await client.users.getUserList({
			emailAddress: [email],
			limit: 20,
		});

		for (const user of result.data) {
			await client.users.deleteUser(user.id);
		}
	}

	return {};
}
