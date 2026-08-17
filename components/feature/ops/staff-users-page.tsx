'use client';

import { OpsPageShell } from '@/components/feature/layout/ops-page-shell';
import {
	ConfirmModalActions,
	LoadingSpinner,
} from '@/components/ui/touch-controls';
import { parseEmailLines } from '@/src/utils/staff_emails';
import { useInFlightLock } from '@/src/utils/in_flight';
import { useMemo, useState } from 'react';

type StaffAction = 'add' | 'remove';

export function StaffUsersPage() {
	const [emailsText, setEmailsText] = useState('');
	const [busy, setBusy] = useState<StaffAction | null>(null);
	const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
	const [message, setMessage] = useState('');
	const [pendingRemove, setPendingRemove] = useState(false);
	const lock = useInFlightLock();
	const parsedEmails = useMemo(
		() => parseEmailLines(emailsText),
		[emailsText]
	);

	const submit = async (action: StaffAction) => {
		await lock.runLocked(async () => {
			setBusy(action);
			setStatus('idle');
			setMessage('');
			if (parsedEmails.error) {
				setStatus('error');
				setMessage(parsedEmails.error);
				setBusy(null);
				setPendingRemove(false);
				return;
			}
			try {
				const response = await fetch('/api/staff-users', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action, emails: emailsText }),
				});
				const data = (await response.json()) as { error?: string };
				if (!response.ok) {
					setStatus('error');
					setMessage(data.error ?? 'Could not update users.');
					return;
				}
				setStatus('success');
				setMessage('Success');
				setEmailsText('');
			} catch {
				setStatus('error');
				setMessage('Could not update users.');
			} finally {
				setBusy(null);
				setPendingRemove(false);
			}
		});
	};

	return (
		<OpsPageShell title="Staff users">
			<div className="border border-gray-200 rounded-xl bg-white p-4">
				<label
					htmlFor="staff-emails"
					className="block text-xs font-semibold text-gray-500 mb-2"
				>
					Email addresses
				</label>
				<textarea
					id="staff-emails"
					value={emailsText}
					onChange={(event) => {
						setEmailsText(event.target.value);
						if (status !== 'idle') {
							setStatus('idle');
							setMessage('');
						}
					}}
					placeholder={'one@example.com\ntwo@example.com'}
					rows={8}
					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[160px] font-mono"
				/>
				<p className="text-xs text-gray-500 mt-2">
					One valid email per line.
				</p>
				{emailsText.trim() && parsedEmails.error ? (
					<p className="mt-2 text-sm font-semibold text-red-700">
						{parsedEmails.error}
					</p>
				) : null}

				<div className="grid grid-cols-2 gap-3 mt-4">
					<button
						type="button"
						disabled={busy !== null || !emailsText.trim() || !!parsedEmails.error}
						onClick={() => void submit('add')}
						className="min-h-[44px] inline-flex items-center justify-center rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 active:bg-green-700 disabled:opacity-50 touch-manipulation"
					>
						{busy === 'add' ? (
							<LoadingSpinner className="h-4 w-4 text-white" />
						) : (
							'Add'
						)}
					</button>
					<button
						type="button"
						disabled={busy !== null || !emailsText.trim() || !!parsedEmails.error}
						onClick={() => setPendingRemove(true)}
						className="min-h-[44px] inline-flex items-center justify-center rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:bg-red-700 disabled:opacity-50 touch-manipulation"
					>
						{busy === 'remove' ? (
							<LoadingSpinner className="h-4 w-4 text-white" />
						) : (
							'Remove'
						)}
					</button>
				</div>

				{status === 'success' ? (
					<p className="mt-4 text-sm font-semibold text-green-700">
						{message}
					</p>
				) : null}
				{status === 'error' ? (
					<p className="mt-4 text-sm font-semibold text-red-700">
						{message}
					</p>
				) : null}
			</div>

			{pendingRemove ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
					onClick={() => busy === null && setPendingRemove(false)}
				>
					<div
						className="w-full max-w-sm rounded-xl bg-white shadow-xl"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="px-5 py-4 border-b">
							<h2 className="text-lg font-bold">Remove these users?</h2>
							<p className="text-sm text-gray-600 mt-2">
								They will no longer be able to sign in.
							</p>
						</div>
						<ConfirmModalActions
							onCancel={() => setPendingRemove(false)}
							onConfirm={() => void submit('remove')}
							confirmLabel="Remove"
							confirming={busy === 'remove'}
							cancelDisabled={busy !== null}
						/>
					</div>
				</div>
			) : null}
		</OpsPageShell>
	);
}
