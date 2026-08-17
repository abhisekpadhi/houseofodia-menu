import { StaffUsersPage } from '@/components/feature/ops/staff-users-page';
import { hasAdminEmail } from '@/src/utils/staff_admins';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function StaffUsersRoutePage() {
	const user = await currentUser();
	const emails =
		user?.emailAddresses.map((address) => address.emailAddress) ?? [];
	if (!hasAdminEmail(emails)) {
		redirect('/order');
	}

	return <StaffUsersPage />;
}
