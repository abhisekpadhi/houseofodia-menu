export type InventoryShortcutId =
	| 'all-100'
	| 'chicken-off'
	| 'mutton-off'
	| 'fish-off'
	| 'prawn-off'
	| 'bread-off';

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
		label: 'All 100',
		title: 'Set all dishes to 100?',
		message: 'Every dish on today’s inventory will be set to 100.',
		confirmLabel: 'Set all to 100',
	},
	{
		id: 'chicken-off',
		label: 'Chicken off',
		title: 'Mark chicken out of stock?',
		message: 'All chicken dishes will be set to 0.',
		confirmLabel: 'Chicken off',
	},
	{
		id: 'mutton-off',
		label: 'Mutton off',
		title: 'Mark mutton out of stock?',
		message: 'All mutton dishes will be set to 0.',
		confirmLabel: 'Mutton off',
	},
	{
		id: 'fish-off',
		label: 'Fish off',
		title: 'Mark fish out of stock?',
		message: 'All fish dishes will be set to 0.',
		confirmLabel: 'Fish off',
	},
	{
		id: 'prawn-off',
		label: 'Prawn off',
		title: 'Mark prawn out of stock?',
		message: 'All prawn dishes will be set to 0.',
		confirmLabel: 'Prawn off',
	},
	{
		id: 'bread-off',
		label: 'Bread off',
		title: 'Mark bread out of stock?',
		message: 'Roti and paratha will be set to 0.',
		confirmLabel: 'Bread off',
	},
];

function normalizedName(dishName: string): string {
	return dishName.trim().toLowerCase();
}

export function dishMatchesInventoryShortcut(
	dishName: string,
	shortcut: InventoryShortcutId
): boolean {
	if (shortcut === 'all-100') {
		return true;
	}

	const name = normalizedName(dishName);

	switch (shortcut) {
		case 'chicken-off':
			return name.includes('chicken');
		case 'mutton-off':
			return name.includes('mutton');
		case 'fish-off':
			return name.includes('fish') || name.includes('macha');
		case 'prawn-off':
			return (
				name.includes('prawn') ||
				name.includes('prawns') ||
				name.includes('chingudi')
			);
		case 'bread-off':
			return name.includes('roti') || name.includes('paratha');
		default:
			return false;
	}
}

export function getShortcutTargetDishes(
	dishNames: string[],
	shortcut: InventoryShortcutId
): string[] {
	return dishNames.filter((dishName) =>
		dishMatchesInventoryShortcut(dishName, shortcut)
	);
}

export function applyInventoryShortcut(
	quantities: Record<string, string>,
	dishNames: string[],
	shortcut: InventoryShortcutId
): Record<string, string> {
	const next = { ...quantities };
	const targets = getShortcutTargetDishes(dishNames, shortcut);
	const nextQty = shortcut === 'all-100' ? '100' : '0';

	for (const dishName of targets) {
		next[dishName] = nextQty;
	}

	return next;
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
