import {
	isInfiniteInventoryDish,
	UNLIMITED_INVENTORY_QTY,
} from '@/src/utils/inventory_utils';

export type InventoryShortcutId =
	| 'all-oos'
	| 'all-infinity'
	| 'chicken-off'
	| 'chicken-on'
	| 'mutton-off'
	| 'mutton-on'
	| 'fish-off'
	| 'fish-on'
	| 'prawn-off'
	| 'prawn-on'
	| 'bread-off'
	| 'bread-on';

export type InventoryShortcut = {
	id: InventoryShortcutId;
	label: string;
	title: string;
	message: string;
	confirmLabel: string;
};

export const INVENTORY_SHORTCUTS: InventoryShortcut[] = [
	{
		id: 'all-oos',
		label: '🚫 All OOS',
		title: 'Mark everything out of stock?',
		message: 'Every dish on today’s inventory will be set to 0.',
		confirmLabel: 'All OOS',
	},
	{
		id: 'all-infinity',
		label: '∞ All Infinity',
		title: 'Mark everything unlimited?',
		message: 'Every dish on today’s inventory will be set to unlimited (∞).',
		confirmLabel: 'All Infinity',
	},
	{
		id: 'chicken-off',
		label: '🐔 Chicken off',
		title: 'Mark chicken out of stock?',
		message: 'All chicken dishes will be set to 0.',
		confirmLabel: 'Chicken off',
	},
	{
		id: 'chicken-on',
		label: '🐔 Chicken on',
		title: 'Mark chicken unlimited?',
		message: 'All chicken dishes will be set to unlimited (∞).',
		confirmLabel: 'Chicken on',
	},
	{
		id: 'mutton-off',
		label: '🐑 Mutton off',
		title: 'Mark mutton out of stock?',
		message: 'All mutton dishes will be set to 0.',
		confirmLabel: 'Mutton off',
	},
	{
		id: 'mutton-on',
		label: '🐑 Mutton on',
		title: 'Mark mutton unlimited?',
		message: 'All mutton dishes will be set to unlimited (∞).',
		confirmLabel: 'Mutton on',
	},
	{
		id: 'fish-off',
		label: '🐟 Fish off',
		title: 'Mark fish out of stock?',
		message: 'All fish dishes will be set to 0.',
		confirmLabel: 'Fish off',
	},
	{
		id: 'fish-on',
		label: '🐟 Fish on',
		title: 'Mark fish unlimited?',
		message: 'All fish dishes will be set to unlimited (∞).',
		confirmLabel: 'Fish on',
	},
	{
		id: 'prawn-off',
		label: '🦐 Prawn off',
		title: 'Mark prawn out of stock?',
		message: 'All prawn dishes will be set to 0.',
		confirmLabel: 'Prawn off',
	},
	{
		id: 'prawn-on',
		label: '🦐 Prawn on',
		title: 'Mark prawn unlimited?',
		message: 'All prawn dishes will be set to unlimited (∞).',
		confirmLabel: 'Prawn on',
	},
	{
		id: 'bread-off',
		label: '🫓 Bread off',
		title: 'Mark bread out of stock?',
		message: 'Roti and paratha will be set to 0.',
		confirmLabel: 'Bread off',
	},
	{
		id: 'bread-on',
		label: '🫓 Bread on',
		title: 'Mark bread unlimited?',
		message: 'Roti and paratha will be set to unlimited (∞).',
		confirmLabel: 'Bread on',
	},
];

type DishCategoryShortcut =
	| 'chicken'
	| 'mutton'
	| 'fish'
	| 'prawn'
	| 'bread';

function normalizedName(dishName: string): string {
	return dishName.trim().toLowerCase();
}

function getDishCategoryFromShortcut(
	shortcut: InventoryShortcutId
): DishCategoryShortcut | null {
	if (shortcut.startsWith('chicken-')) {
		return 'chicken';
	}
	if (shortcut.startsWith('mutton-')) {
		return 'mutton';
	}
	if (shortcut.startsWith('fish-')) {
		return 'fish';
	}
	if (shortcut.startsWith('prawn-')) {
		return 'prawn';
	}
	if (shortcut.startsWith('bread-')) {
		return 'bread';
	}
	return null;
}

function dishMatchesCategory(
	dishName: string,
	category: DishCategoryShortcut
): boolean {
	const name = normalizedName(dishName);

	switch (category) {
		case 'chicken':
			return name.includes('chicken');
		case 'mutton':
			return name.includes('mutton');
		case 'fish':
			return name.includes('fish') || name.includes('macha');
		case 'prawn':
			return (
				name.includes('prawn') ||
				name.includes('prawns') ||
				name.includes('chingudi')
			);
		case 'bread':
			return name.includes('roti') || name.includes('paratha');
	}
}

export function dishMatchesInventoryShortcut(
	dishName: string,
	shortcut: InventoryShortcutId
): boolean {
	if (isInfiniteInventoryDish(dishName)) {
		return false;
	}

	if (shortcut === 'all-oos' || shortcut === 'all-infinity') {
		return true;
	}

	const category = getDishCategoryFromShortcut(shortcut);
	if (!category) {
		return false;
	}

	return dishMatchesCategory(dishName, category);
}

export function getShortcutTargetDishes(
	dishNames: string[],
	shortcut: InventoryShortcutId
): string[] {
	return dishNames.filter((dishName) =>
		dishMatchesInventoryShortcut(dishName, shortcut)
	);
}

export function isOutOfStockInventoryShortcut(
	shortcut: InventoryShortcutId
): boolean {
	return shortcut === 'all-oos' || shortcut.endsWith('-off');
}

export function isUnlimitedInventoryShortcut(
	shortcut: InventoryShortcutId
): boolean {
	return shortcut === 'all-infinity' || shortcut.endsWith('-on');
}

export function applyInventoryShortcut(
	quantities: Record<string, string>,
	dishNames: string[],
	shortcut: InventoryShortcutId
): Record<string, string> {
	const next = { ...quantities };
	const targets = getShortcutTargetDishes(dishNames, shortcut);
	const qty = isOutOfStockInventoryShortcut(shortcut)
		? '0'
		: String(UNLIMITED_INVENTORY_QTY);

	for (const dishName of targets) {
		next[dishName] = qty;
	}

	return next;
}

/** Per-category shortcuts (e.g. chicken off), not all-menu shortcuts. */
export function isDishCategoryInventoryShortcut(
	shortcut: InventoryShortcutId
): boolean {
	return getDishCategoryFromShortcut(shortcut) !== null;
}

export function shortcutConfirmMessage(
	shortcut: InventoryShortcut,
	affectedCount: number
): string {
	if (affectedCount === 0) {
		return `No matching dishes found on today’s menu. ${shortcut.message}`;
	}

	const dishLabel = affectedCount === 1 ? '1 dish' : `${affectedCount} dishes`;
	return `${shortcut.message} (${dishLabel} will be updated.)`;
}
