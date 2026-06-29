import { TMenu, TMenuApiItem } from '@/src/models/common';

export type MenuLabelItem = {
	name: string;
	internal_name?: string;
	description?: string;
};

export function getMenuDisplayName(item: MenuLabelItem): string {
	const internalName = item.internal_name?.trim();
	return internalName || item.name;
}

export function shouldShowMenuBillName(item: MenuLabelItem): boolean {
	const internalName = item.internal_name?.trim();
	return Boolean(internalName && internalName !== item.name);
}

export function menuItemMatchesSearch(item: MenuLabelItem, term: string): boolean {
	const normalizedTerm = term.trim().toLowerCase();
	if (!normalizedTerm) {
		return true;
	}
	return (
		item.name.toLowerCase().includes(normalizedTerm) ||
		(item.internal_name?.toLowerCase().includes(normalizedTerm) ?? false) ||
		(item.description?.toLowerCase().includes(normalizedTerm) ?? false)
	);
}

export function stringToColor(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
	}
	let color = '#';
	for (let i = 0; i < 3; i++) {
		const value = (hash >> (i * 8)) & 0xff;
		const lightValue = Math.floor((value + 255) / 2);
		color += ('00' + lightValue.toString(16)).slice(-2);
	}
	return color;
}

export function buildMenuFromApiItems(items: TMenuApiItem[]): TMenu {
	const result: TMenu = {};
	items.forEach((item) => {
		if (!result[item.category]) {
			result[item.category] = [];
		}
		if (item.status?.toLowerCase() === 'on') {
			result[item.category].push({
				status: item.status,
				name: item.name,
				...(item.internal_name ? { internal_name: item.internal_name } : {}),
				description: item.description,
				price: item.price,
				is_veg: item.is_veg,
				...(item.sop ? { sop: item.sop } : {}),
			});
		}
	});
	return result;
}

export const KITCHEN_ITEM_GROUPS = [
	'mains/starter/gravy',
	'sides',
	'sips',
	'thali/dessert',
] as const;

export type KitchenItemGroup = (typeof KITCHEN_ITEM_GROUPS)[number];

export function buildDishCategoryMap(
	items: TMenuApiItem[]
): Record<string, string> {
	const map: Record<string, string> = {};
	items.forEach((item) => {
		map[item.name] = item.category;
	});
	return map;
}

export function buildDishInternalNameMap(
	items: TMenuApiItem[]
): Record<string, string> {
	const map: Record<string, string> = {};
	items.forEach((item) => {
		const internalName = item.internal_name?.trim();
		if (internalName) {
			map[item.name] = internalName;
		}
	});
	return map;
}

/** Kitchen-facing label for KOT; falls back to bill `name`. */
export function getKotDisplayName(
	billName: string,
	internalNameByBillName?: Record<string, string>
): string {
	return getMenuDisplayName({
		name: billName,
		internal_name: internalNameByBillName?.[billName],
	});
}

export function mapCategoryToKitchenGroup(
	category: string
): KitchenItemGroup | null {
	const cat = category.toLowerCase().trim();

	if (cat === 'packaging') {
		return null;
	}
	if (cat === 'sides' || cat === 'rice' || cat === 'accompaniments') {
		return 'sides';
	}
	if (cat === 'sips') {
		return 'sips';
	}
	if (cat === 'thalis' || cat === 'desserts' || cat === 'combo') {
		return 'thali/dessert';
	}

	return 'mains/starter/gravy';
}
