export type DayChecklistArea = 'kitchen' | 'dining';

export type DayChecklistKind = 'open' | 'close';

export type DayChecklistItem = {
	id: string;
	label: string;
};

export type DayChecklistSection = {
	area: DayChecklistArea;
	title: string;
	items: DayChecklistItem[];
};

const DAY_OPEN_CHECKLIST: DayChecklistSection[] = [
	{
		area: 'kitchen',
		title: 'Kitchen',
		items: [
			{ id: 'k-gas', label: 'Gas / stove checked and working' },
			{ id: 'k-prep-clean', label: 'Prep surfaces cleaned and sanitised' },
			{ id: 'k-fridge', label: 'Refrigerator temperature checked' },
			{ id: 'k-stock', label: 'Opening stock received and logged' },
			{ id: 'k-kot', label: 'KOT printer paper and test print OK' },
			{ id: 'k-oil-spice', label: 'Oil, spices and bases stocked' },
		],
	},
	{
		area: 'dining',
		title: 'Dining',
		items: [
			{ id: 'd-floor', label: 'Floor swept and mopped' },
			{ id: 'd-tables', label: 'Tables and chairs wiped and set' },
			{ id: 'd-menu', label: 'Menu boards / QR stands updated' },
			{ id: 'd-pos', label: 'POS ready and cash float verified' },
			{ id: 'd-welcome', label: 'Welcome drinks and water ready' },
			{ id: 'd-restroom', label: 'Restrooms checked and stocked' },
		],
	},
];

const DAY_CLOSE_CHECKLIST: DayChecklistSection[] = [
	{
		area: 'kitchen',
		title: 'Kitchen',
		items: [
			{ id: 'k-orders', label: 'All orders cleared or handed over' },
			{ id: 'k-equipment', label: 'Equipment cleaned and switched off' },
			{ id: 'k-prep-store', label: 'Prep wrapped, labelled and stored' },
			{ id: 'k-fridge-close', label: 'Refrigerator checked and closed properly' },
			{ id: 'k-gas-off', label: 'Gas turned off where applicable' },
			{ id: 'k-waste', label: 'Waste disposed and bins cleaned' },
		],
	},
	{
		area: 'dining',
		title: 'Dining',
		items: [
			{ id: 'd-tables-clear', label: 'All tables cleared and wiped' },
			{ id: 'd-floor-close', label: 'Floor swept and mopped' },
			{ id: 'd-cash', label: 'Cash reconciled and secured' },
			{ id: 'd-lights', label: 'Lights, AC and fans set for close' },
			{ id: 'd-doors', label: 'Doors, shutters and locks checked' },
			{ id: 'd-lost-found', label: 'Lost & found area checked' },
		],
	},
];

export function getDayChecklistSections(
	kind: DayChecklistKind
): DayChecklistSection[] {
	return kind === 'open' ? DAY_OPEN_CHECKLIST : DAY_CLOSE_CHECKLIST;
}

export function getAllDayChecklistItemIds(kind: DayChecklistKind): string[] {
	return getDayChecklistSections(kind).flatMap((section) =>
		section.items.map((item) => item.id)
	);
}
