import axios from 'axios';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Opt out of caching

const fetchSheetData = async (
	sheetId: string,
	apiKey: string,
	sheetName: string
) => {
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}?key=${apiKey}`;

	const response = await axios.get(url);

	return response.data.values;
};

export async function GET() {
	const { GOOGLE_SHEETS_API_KEY, GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME } =
		process.env;


	if (!GOOGLE_SHEETS_API_KEY || !GOOGLE_SHEET_ID) {
		return NextResponse.json(
			{ error: 'Google Sheets API key or Sheet ID not provided' },
			{ status: 500 }
		);
	}

	try {
		const data = await fetchSheetData(
			GOOGLE_SHEET_ID,
			GOOGLE_SHEETS_API_KEY,
			GOOGLE_SHEET_NAME
		);
		const [header, ...rows] = data;

		const normalizeHeaderKey = (value: string) =>
			value.trim().toLowerCase().replace(/\s+/g, '_');

		const columnIndex = (key: string, fallback: number) => {
			const index = header.findIndex(
				(cell: string) => normalizeHeaderKey(String(cell ?? '')) === key
			);
			return index >= 0 ? index : fallback;
		};

		const columns = {
			status: columnIndex('status', 0),
			category: columnIndex('category', 1),
			name: columnIndex('name', 2),
			description: columnIndex('description', 3),
			is_veg: columnIndex('is_veg', 4),
			price: columnIndex('price', 5),
			internal_name: columnIndex('internal_name', 6),
			sop: columnIndex('sop', 7),
		};

		const cell = (row: string[], key: keyof typeof columns) =>
			row.length > columns[key] ? row[columns[key]] : undefined;

		const jsonData = rows.map((row: string[]) => {
			const internalName = `${cell(row, 'internal_name') ?? ''}`.trim();
			const sop = `${cell(row, 'sop') ?? ''}`.trim();
			return {
				status: `${cell(row, 'status') ?? 'OFF'}`,
				category: `${cell(row, 'category') ?? ''}`.trim(),
				name: `${cell(row, 'name') ?? ''}`,
				...(internalName ? { internal_name: internalName } : {}),
				description: `${cell(row, 'description') ?? ''}`,
				is_veg: `${cell(row, 'is_veg') ?? ''}`.toLowerCase() === 'veg',
				price: `${cell(row, 'price') ?? '0'}`,
				...(sop ? { sop } : {}),
			};
		});

		return NextResponse.json(jsonData);
	} catch (error) {
		return NextResponse.json(
			{ error: 'Failed to fetch data from Google Sheets' },
			{ status: 500 }
		);
	}
}
