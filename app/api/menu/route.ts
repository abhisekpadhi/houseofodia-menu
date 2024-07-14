import { NextResponse } from 'next/server';
import axios from 'axios';

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
			GOOGLE_SHEETS_API_KEY,
			GOOGLE_SHEET_NAME
		);
		const [header, ...rows] = data;

		const jsonData = rows.map((row: any[]) => ({
			status: row.length > 0 ? row[0] : 'OFF',
			category: row.length > 1 ? row[1] : '',
			name: row.length > 2 ? row[2] : '',
			description: row.length > 3 ? row[3] : '',
			is_veg: row.length > 4 ? row[4].toLowerCase() === 'veg' : false,
			price: row.length > 5 ? `${row[5]}` : '0',
		}));

		return NextResponse.json(jsonData);
	} catch (error) {
		return NextResponse.json(
			{ error: 'Failed to fetch data from Google Sheets' },
			{ status: 500 }
		);
	}
}
