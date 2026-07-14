import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * API Proxy for Upstox Portfolio Holdings
 * Proxies requests to Upstox to avoid CORS issues in the browser.
 *
 * Headers:
 * - Authorization: Bearer token from Upstox
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
        return NextResponse.json(
            { error: 'Authorization header required' },
            { status: 401 }
        );
    }

    try {
        const upstoxUrl = 'https://api.upstox.com/v2/portfolio/long-term-holdings';

        console.log('📡 Proxying holdings request to Upstox...');

        const response = await axios.get(upstoxUrl, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
            },
            timeout: 30000
        });

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('Holdings proxy error:', error.message);

        if (error.response?.status === 429) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait a moment before retrying.', status: 'RATE_LIMITED' },
                { status: 429 }
            );
        }

        if (error.response) {
            return NextResponse.json(
                { error: error.response.data?.message || error.message, upstoxStatus: error.response.status },
                { status: error.response.status }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to fetch holdings' },
            { status: 500 }
        );
    }
}
