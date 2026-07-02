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
		area: 'dining',
		title: 'Dining',
		items: [
			{ id: 'd-floor-sweeping', label: 'Floor sweeping done' },
			{ id: 'd-no-ants-stains', label: 'No ants or stains on floor' },
			{
				id: 'd-tables-wiped',
				label:
					'Tables are wiped, no spots on tables — if spots, report on WhatsApp',
			},
			{ id: 'd-wash-basins', label: 'Wash basins cleaned' },
			{ id: 'd-wash-basin-taps', label: 'Wash basin taps cleaned' },
			{
				id: 'd-wash-basin-flow',
				label: 'Wash basin water flowing fine, no jam',
			},
			{ id: 'd-wash-basin-drawer', label: 'Drawer below washbasin is okay' },
			{ id: 'd-handwash-dispenser', label: 'Handwash dispenser cleaned' },
			{ id: 'd-wash-basin-mirrors', label: '2 washbasin mirrors cleaned' },
			{ id: 'd-large-mirror', label: '1 large mirror at end of room cleaned' },
			{ id: 'd-chair-body', label: 'Chair body is cleaned' },
			{ id: 'd-chair-cushion', label: 'Chair cushion no spots' },
			{
				id: 'd-chair-food-gaps',
				label: 'Chairs — no food stuck below or side gaps of cushion',
			},
			{ id: 'd-upi-speaker', label: 'UPI Speaker device charged' },
			{ id: 'd-aroma-machine', label: 'Aroma machine switched on & working' },
			{ id: 'd-kitchen-phone', label: 'Kitchen phone charged & working' },
			{
				id: 'd-cash-counter',
				label: 'Cash counter cleaned and arranged — check corners for cockroaches',
			},
			{
				id: 'd-imli-candy',
				label: 'Imli candy stock available for the day, else report on WhatsApp',
			},
			{
				id: 'd-table-setup',
				label: 'All tables have water bottles, spoon, fork, tissue',
			},
			{ id: 'd-under-table', label: 'All tables under table & legs checked' },
			{ id: 'd-music', label: 'Music switched on' },
			{ id: 'd-lights', label: 'Lights are working' },
			{ id: 'd-ac', label: 'AC switched on & working' },
			{ id: 'd-dustbins', label: 'Dustbins cleaned' },
			{ id: 'd-plants', label: 'Plants are dusted' },
			{ id: 'd-ac-drain', label: 'AC drain pipe working fine' },
			{ id: 'd-floor-mats', label: 'Floor mats are cleaned' },
			{ id: 'd-waiting-area', label: 'Waiting area seating is clean' },
			{ id: 'd-ordering-software', label: 'Ordering software tested' },
			{ id: 'd-bill-printer', label: 'Bill printer tested' },
			{ id: 'd-staff-phone', label: 'Staff phone battery check' },
			{ id: 'd-helmet-stand', label: 'Helmet stand outside dining' },
		],
	},
	{
		area: 'kitchen',
		title: 'Kitchen',
		items: [
			{ id: 'k-gas-stove', label: 'Gas / stove check' },
			{ id: 'k-welcome-drink', label: 'Welcome drink ready' },
			{ id: 'k-fryums', label: 'Complementary fryums ready' },
			{ id: 'k-aloo-kalara', label: 'Aloo kalara cut' },
			{ id: 'k-chicken-stock', label: 'Chicken stock ok' },
			{ id: 'k-fish-stock', label: 'Fish stock ok' },
			{ id: 'k-mutton-stock', label: 'Mutton stock ok' },
			{ id: 'k-prawn-stock', label: 'Prawn stock ok' },
			{ id: 'k-paneer-stock', label: 'Paneer stock ok' },
			{ id: 'k-milk-curd-stock', label: 'Milk / Curd stock ok' },
			{ id: 'k-rabri-stock', label: 'Rabri stock ok' },
			{ id: 'k-coconut-grated', label: 'Coconut grated' },
			{ id: 'k-cherry-stock', label: 'Cherry stock ok' },
			{ id: 'k-microwave', label: 'Microwave working' },
			{ id: 'k-chimney', label: 'Chimney working' },
			{ id: 'k-mixie', label: 'Mixie working' },
			{ id: 'k-rice', label: 'Rice ready / cooked' },
			{ id: 'k-kheer', label: 'Kheer ready' },
			{ id: 'k-brinjal', label: 'Brinjal cut for dahi baingan' },
			{ id: 'k-gravy-bases', label: 'Gravy bases ready' },
			{ id: 'k-pakhala', label: 'Pakhala ready' },
			{ id: 'k-vegetables', label: 'Vegetables ready' },
			{
				id: 'k-thali-side-stock',
				label: 'Thali side items — previous day stock tasted',
			},
			{ id: 'k-garnish', label: 'Garnish — Kaju, fried onions check' },
			{ id: 'k-peanuts', label: 'Peanuts check' },
			{ id: 'k-vegetable-stock', label: 'Vegetable stock check' },
			{
				id: 'k-flour-stock',
				label: 'Flour stock check for bread and fried items',
			},
			{ id: 'k-sugar-salt', label: 'Sugar / salt stock check' },
			{ id: 'k-oils-ghee-butter', label: 'Oils, Ghee, Butter stock check' },
			{
				id: 'k-fridge-freezer',
				label: 'Refrigerator and freezer working, temperature ok',
			},
			{ id: 'k-prep-surface', label: 'Prep surface clean & sanitised' },
			{ id: 'k-crockery', label: 'Crockery ready' },
			{ id: 'k-cutlery', label: 'Cutlery ready' },
			{ id: 'k-chutney', label: 'Chutney ready for starters' },
			{ id: 'k-washing-area', label: 'Washing area ready' },
			{ id: 'k-washing-items', label: 'Washing items ready' },
			{ id: 'k-dustbins', label: 'Dustbins ready' },
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
