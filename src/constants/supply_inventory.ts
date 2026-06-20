export type SupplyInventoryKind = 'utensils' | 'tableware' | 'raw-materials';

export type SupplyInventoryItem = {
	name: string;
	unit: string;
};

export type SupplyInventoryConfig = {
	kind: SupplyInventoryKind;
	title: string;
	items: SupplyInventoryItem[];
};

export const SUPPLY_INVENTORY_CONFIGS: Record<
	SupplyInventoryKind,
	SupplyInventoryConfig
> = {
	utensils: {
		kind: 'utensils',
		title: 'Utensils inventory',
		items: [
			{ name: 'Ladle — small', unit: 'pcs' },
			{ name: 'Ladle — large', unit: 'pcs' },
			{ name: 'Spatula', unit: 'pcs' },
			{ name: 'Tongs', unit: 'pcs' },
			{ name: 'Wok — large', unit: 'pcs' },
			{ name: 'Kadai — medium', unit: 'pcs' },
			{ name: 'Kadai — large', unit: 'pcs' },
			{ name: 'Pressure cooker — 5L', unit: 'pcs' },
			{ name: 'Pressure cooker — 10L', unit: 'pcs' },
			{ name: 'Knife set', unit: 'sets' },
			{ name: 'Chopping board', unit: 'pcs' },
			{ name: 'Strainer', unit: 'pcs' },
		],
	},
	tableware: {
		kind: 'tableware',
		title: 'Tableware inventory',
		items: [
			{ name: 'Full plate', unit: 'pcs' },
			{ name: 'Half plate', unit: 'pcs' },
			{ name: 'Bowls — small', unit: 'pcs' },
			{ name: 'Bowls — large', unit: 'pcs' },
			{ name: 'Water glass', unit: 'pcs' },
			{ name: 'Steel glass', unit: 'pcs' },
			{ name: 'Serving spoon', unit: 'pcs' },
			{ name: 'Serving tray', unit: 'pcs' },
			{ name: 'Water jug', unit: 'pcs' },
			{ name: 'Tissue box', unit: 'pcs' },
		],
	},
	'raw-materials': {
		kind: 'raw-materials',
		title: 'Raw material inventory',
		items: [
			{ name: 'Basmati rice', unit: 'kg' },
			{ name: 'Atta / flour', unit: 'kg' },
			{ name: 'Cooking oil', unit: 'L' },
			{ name: 'Onions', unit: 'kg' },
			{ name: 'Potatoes', unit: 'kg' },
			{ name: 'Tomatoes', unit: 'kg' },
			{ name: 'Ginger-garlic paste', unit: 'kg' },
			{ name: 'Chicken — boneless', unit: 'kg' },
			{ name: 'Chicken — with bone', unit: 'kg' },
			{ name: 'Mutton', unit: 'kg' },
			{ name: 'Fish — rohu', unit: 'kg' },
			{ name: 'Spice mix box', unit: 'box' },
		],
	},
};
