import { NextResponse } from 'next/server';
import axios from 'axios';

const fetchSheetData = async (sheetId: string, apiKey: string) => {
	const response = await axios.get(
		`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/menu_grouped_by_category?key=${apiKey}`
	);
	return response.data.values;
};

export async function GET() {
	const { GOOGLE_SHEETS_API_KEY, GOOGLE_SHEET_ID } = process.env;

	// console.log(GOOGLE_SHEETS_API_KEY, GOOGLE_SHEET_ID);

	if (!GOOGLE_SHEETS_API_KEY || !GOOGLE_SHEET_ID) {
		return NextResponse.json(
			{ error: 'Google Sheets API key or Sheet ID not provided' },
			{ status: 500 }
		);
	}

	try {
		const data = await fetchSheetData(
			GOOGLE_SHEET_ID,
			GOOGLE_SHEETS_API_KEY
		);
		const [header, ...rows] = data;

		const jsonData = rows.map((row: any) => ({
			category: row[0],
			name: row[1],
			description: row[2],
			is_veg: row[3].toLowerCase() === 'true',
			price: Number(row[4]),
		}));

		return NextResponse.json(jsonData);
	} catch (error) {
		return NextResponse.json(
			{ error: 'Failed to fetch data from Google Sheets' },
			{ status: 500 }
		);
	}
}
