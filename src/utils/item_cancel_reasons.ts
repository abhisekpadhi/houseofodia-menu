import { ItemCancelReason } from '@/src/models/common';

export const ITEM_CANCEL_REASONS: {
	value: ItemCancelReason;
	label: string;
}[] = [
	{ value: 'customer_cancel', label: 'Customer cancelled' },
	{ value: 'waiter_cancel', label: 'Waiter cancelled' },
	{ value: 'kitchen_out_of_stock', label: 'Kitchen — out of stock' },
	{ value: 'kitchen_unable_to_prepare', label: 'Kitchen — unable to prepare' },
	{ value: 'wrong_order', label: 'Wrong item ordered' },
	{ value: 'duplicate_order', label: 'Duplicate order' },
	{ value: 'quality_issue', label: 'Quality issue' },
	{ value: 'manager_void', label: 'Manager void' },
];

export function itemCancelReasonLabel(reason: ItemCancelReason): string {
	return (
		ITEM_CANCEL_REASONS.find((entry) => entry.value === reason)?.label ?? reason
	);
}
