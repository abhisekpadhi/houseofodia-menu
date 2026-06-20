import { MENU_SOP_OVERRIDES } from '@/src/constants/menu_sops';

export type MenuItemSop = {
	steps: string[];
	notes?: string;
};

export function parseSopText(text: string): string[] {
	return text
		.split(/\n|(?:\s*\|\s*)/)
		.map((step) => step.trim())
		.filter(Boolean);
}

export function getMenuItemSop(
	dishName: string,
	apiSop?: string
): MenuItemSop {
	const override = MENU_SOP_OVERRIDES[dishName];
	if (override) {
		return override;
	}

	const trimmedApiSop = apiSop?.trim();
	if (trimmedApiSop) {
		return { steps: parseSopText(trimmedApiSop) };
	}

	return {
		steps: [],
		notes:
			'SOP not documented yet. Add steps in src/data/menu-sop-items.json or menu_sops.ts.',
	};
}

export function encodeDishSlug(name: string): string {
	return encodeURIComponent(name);
}

export function decodeDishSlug(slug: string): string {
	return decodeURIComponent(slug);
}
