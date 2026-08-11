import axios from 'axios';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_SHEET_ID = '1B0m-Zc1iaIqsxuaWhmaoIpuWnujRHW4brIhafSHvXXc';

const ALLOWED_SHEETS = ['raw material', 'dish'] as const;
type AllowedSheet = (typeof ALLOWED_SHEETS)[number];

export type RawMaterialSheetItem = {
	category: string;
	name: string;
};

function isAllowedSheet(value: string): value is AllowedSheet {
	return (ALLOWED_SHEETS as readonly string[]).includes(value);
}

function parseRawMaterialRows(values: string[][] | undefined): RawMaterialSheetItem[] {
	if (!values?.length) {
		return [];
	}

	const items: RawMaterialSheetItem[] = [];
	let lastCategory = '';

	for (const row of values) {
		const category = `${row?.[0] ?? ''}`.trim();
		const name = `${row?.[1] ?? ''}`.trim();
		if (category) {
			lastCategory = category;
		}
		if (!name) {
			continue;
		}
		items.push({
			category: category || lastCategory || 'Uncategorized',
			name,
		});
	}

	return items;
}

export async function GET(request: Request) {
	const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
	const sheetId =
		process.env.GOOGLE_RAW_MATERIALS_SHEET_ID?.trim() || DEFAULT_SHEET_ID;
	const requestedSheet =
		new URL(request.url).searchParams.get('sheet')?.trim() || 'raw material';
	const sheetName = isAllowedSheet(requestedSheet)
		? requestedSheet
		: null;

	if (!apiKey) {
		return NextResponse.json(
			{ error: 'Google Sheets API key not provided' },
			{ status: 500 }
		);
	}

	if (!sheetName) {
		return NextResponse.json(
			{ error: `Invalid sheet. Allowed: ${ALLOWED_SHEETS.join(', ')}` },
			{ status: 400 }
		);
	}

	try {
		const range = encodeURIComponent(`'${sheetName}'!A:B`);
		const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
		const response = await axios.get(url);
		const items = parseRawMaterialRows(response.data.values);

		return NextResponse.json(items);
	} catch (error) {
		console.error(`Failed to fetch "${sheetName}" sheet:`, error);
		return NextResponse.json(
			{ error: `Failed to fetch "${sheetName}" from Google Sheets` },
			{ status: 500 }
		);
	}
}
