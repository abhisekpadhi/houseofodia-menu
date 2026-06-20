import menuSopItemsData from '@/src/data/menu-sop-items.json';

export type MenuSopItem = {
	category: string;
	name: string;
	description: string;
	is_veg: boolean;
	price: string;
	sop: string;
};

export const MENU_SOP_ITEMS: MenuSopItem[] =
	menuSopItemsData as MenuSopItem[];

export function getMenuSopItem(name: string): MenuSopItem | undefined {
	return MENU_SOP_ITEMS.find((item) => item.name === name);
}

export function getMenuSopCategories(): string[] {
	return Array.from(new Set(MENU_SOP_ITEMS.map((item) => item.category))).sort(
		(a, b) => a.localeCompare(b)
	);
}

export function getMenuSopItemsByCategory(): {
	category: string;
	items: MenuSopItem[];
}[] {
	const groups = new Map<string, MenuSopItem[]>();

	for (const item of MENU_SOP_ITEMS) {
		const existing = groups.get(item.category);
		if (existing) {
			existing.push(item);
		} else {
			groups.set(item.category, [item]);
		}
	}

	return getMenuSopCategories().map((category) => ({
		category,
		items: (groups.get(category) ?? []).sort((a, b) =>
			a.name.localeCompare(b.name)
		),
	}));
}
