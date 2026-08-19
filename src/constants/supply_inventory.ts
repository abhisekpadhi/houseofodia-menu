export type SupplyInventoryKind =
	| 'utensils'
	| 'tableware'
	| 'raw-materials'
	| 'dish';

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
		/** Item list is loaded from the Google Sheet "raw material" tab. Counts persist across days. */
		items: [],
	},
	dish: {
		kind: 'dish',
		title: 'Dish inventory',
		/** Item list is loaded from the Google Sheet "dish" tab. Counts persist across days. */
		items: [],
	},
};
