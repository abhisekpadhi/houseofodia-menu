/** Presence names for local print servers on the order_ops Ably channel. */

export const KOT_PRINTER_DEVICE_NAME = 'KOT Printer';
export const BILL_PRINTER_DEVICE_NAME = 'Bill Printer';

/** True when a presence member is named like the kitchen KOT print server. */
export function isKotPrinterOnline(memberDeviceNames: string[]): boolean {
	const target = KOT_PRINTER_DEVICE_NAME.trim().toLowerCase();
	return memberDeviceNames.some((name) => name.trim().toLowerCase() === target);
}

/** True when Bill Printer is present on the channel. */
export function isBillPrinterOnline(memberDeviceNames: string[]): boolean {
	const target = BILL_PRINTER_DEVICE_NAME.trim().toLowerCase();
	return memberDeviceNames.some((name) => name.trim().toLowerCase() === target);
}
