import { isInfiniteInventoryDish } from '@/src/utils/inventory_utils';

export type InventoryShortcutId =
	| 'all-100'
	| 'all-oos'
	| 'chicken-off'
	| 'chicken-100'
	| 'mutton-off'
	| 'mutton-100'
	| 'fish-off'
	| 'fish-100'
	| 'prawn-off'
	| 'prawn-100'
	| 'bread-off'
	| 'bread-100';

export type InventoryShortcut = {
	id: InventoryShortcutId;
	label: string;
	title: string;
	message: string;
	confirmLabel: string;
};

export const INVENTORY_SHORTCUTS: InventoryShortcut[] = [
	{
		id: 'all-100',
		label: '💯 All 100',
		title: 'Set all dishes to 100?',
		message: 'Every dish on today’s inventory will be set to 100.',
		confirmLabel: 'Set all to 100',
	},
	{
		id: 'all-oos',
		label: '🚫 All OOS',
		title: 'Mark everything out of stock?',
		message: 'Every dish on today’s inventory will be set to 0.',
		confirmLabel: 'All OOS',
	},
	{
		id: 'chicken-off',
		label: '🐔 Chicken off',
		title: 'Mark chicken out of stock?',
		message: 'All chicken dishes will be set to 0.',
		confirmLabel: 'Chicken off',
	},
	{
		id: 'chicken-100',
		label: '🐔 Chicken 100',
		title: 'Set chicken dishes to 100?',
		message: 'All chicken dishes will be set to 100.',
		confirmLabel: 'Chicken 100',
	},
	{
		id: 'mutton-off',
		label: '🐑 Mutton off',
		title: 'Mark mutton out of stock?',
		message: 'All mutton dishes will be set to 0.',
		confirmLabel: 'Mutton off',
	},
	{
		id: 'mutton-100',
		label: '🐑 Mutton 100',
		title: 'Set mutton dishes to 100?',
		message: 'All mutton dishes will be set to 100.',
		confirmLabel: 'Mutton 100',
	},
	{
		id: 'fish-off',
		label: '🐟 Fish off',
		title: 'Mark fish out of stock?',
		message: 'All fish dishes will be set to 0.',
		confirmLabel: 'Fish off',
	},
	{
		id: 'fish-100',
		label: '🐟 Fish 100',
		title: 'Set fish dishes to 100?',
		message: 'All fish dishes will be set to 100.',
		confirmLabel: 'Fish 100',
	},
	{
		id: 'prawn-off',
		label: '🦐 Prawn off',
		title: 'Mark prawn out of stock?',
		message: 'All prawn dishes will be set to 0.',
		confirmLabel: 'Prawn off',
	},
	{
		id: 'prawn-100',
		label: '🦐 Prawn 100',
		title: 'Set prawn dishes to 100?',
		message: 'All prawn dishes will be set to 100.',
		confirmLabel: 'Prawn 100',
	},
	{
		id: 'bread-off',
		label: '🫓 Bread off',
		title: 'Mark bread out of stock?',
		message: 'Roti and paratha will be set to 0.',
		confirmLabel: 'Bread off',
	},
	{
		id: 'bread-100',
		label: '🫓 Bread 100',
		title: 'Set bread dishes to 100?',
		message: 'Roti and paratha will be set to 100.',
		confirmLabel: 'Bread 100',
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

	if (shortcut === 'all-100' || shortcut === 'all-oos') {
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

function shortcutTargetQty(shortcut: InventoryShortcutId): '0' | '100' {
	if (shortcut === 'all-oos' || shortcut.endsWith('-off')) {
		return '0';
	}
	return '100';
}

export function isOutOfStockInventoryShortcut(
	shortcut: InventoryShortcutId
): boolean {
	return shortcut === 'all-oos' || shortcut.endsWith('-off');
}

export function applyInventoryShortcut(
	quantities: Record<string, string>,
	dishNames: string[],
	shortcut: InventoryShortcutId
): Record<string, string> {
	const next = { ...quantities };
	const targets = getShortcutTargetDishes(dishNames, shortcut);
	const nextQty = shortcutTargetQty(shortcut);

	for (const dishName of targets) {
		next[dishName] = nextQty;
	}

	return next;
}

/** Per-category shortcuts (e.g. chicken off / chicken 100), not all-menu shortcuts. */
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
