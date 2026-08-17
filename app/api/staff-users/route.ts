import {
	applyStaffUserAction,
	type StaffUserAction,
} from '@/src/utils/clerk_staff_users';
import { hasAdminEmail } from '@/src/utils/staff_admins';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
	await auth.protect();

	const user = await currentUser();
	const emails =
		user?.emailAddresses.map((address) => address.emailAddress) ?? [];
	if (!hasAdminEmail(emails)) {
		return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
	}

	let body: { action?: unknown; emails?: unknown };
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
	}

	const action = body.action;
	if (action !== 'add' && action !== 'remove') {
		return NextResponse.json(
			{ error: 'Choose add or remove.' },
			{ status: 400 }
		);
	}

	try {
		const result = await applyStaffUserAction(
			action as StaffUserAction,
			body.emails
		);
		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}
		return NextResponse.json({ ok: true, message: 'Success' });
	} catch (error) {
		console.error('Staff user update failed', error);
		return NextResponse.json(
			{ error: 'Could not update users.' },
			{ status: 500 }
		);
	}
}
