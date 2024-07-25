import axios from 'axios';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Opt out of caching

export async function GET() {
    const { GITHUB_ACCESS_TOKEN, GIST_ID } = process.env;
    try {
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
          headers: {
            Authorization: `token ${GITHUB_ACCESS_TOKEN}`
          }
        });
        const fileContent = (Object.values(response.data.files)[0] as any).content;
        return NextResponse.json({ bill_no: parseInt(fileContent) });
      } catch (error) {
        console.error('Error fetching Gist:', error);
        return NextResponse.json(
			{ error: 'Error fetching Gist' },
			{ status: 500 }
		);
      }
}

export async function POST(request: Request) {
    const { bill_no } = await request.json();
    const { GITHUB_ACCESS_TOKEN, GIST_ID } = process.env;
    try {
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
          files: {
            // Specify the file name and the new content
            "bill_no": {
              content: bill_no.toString()
            }
          }
        }, {
          headers: {
            Authorization: `token ${GITHUB_ACCESS_TOKEN}`
          }
        });
        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('Error updating Gist:', error);
        return NextResponse.json(
			{ error: 'Error fetching Gist' },
			{ status: 500 }
		);
      }
}
