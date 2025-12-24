import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * API Proxy for Upstox Historical Candle Data
 * This route proxies requests to Upstox API to avoid CORS issues in the browser.
 * 
 * Query Parameters:
 * - instrumentKey: The instrument key (e.g., NSE_EQ|INE002A01018)
 * - unit: Time unit (minutes, hours, days, weeks, months)
 * - interval: Interval value (1, 5, 15, 30, etc.)
 * - toDate: End date (YYYY-MM-DD)
 * - fromDate: Start date (YYYY-MM-DD)
 * 
 * Headers:
 * - Authorization: Bearer token from Upstox
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const instrumentKey = searchParams.get('instrumentKey');
    const unit = searchParams.get('unit') || 'days';
    const interval = searchParams.get('interval') || '1';
    const toDate = searchParams.get('toDate');
    const fromDate = searchParams.get('fromDate');

    // Get authorization header from request
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
        return NextResponse.json(
            { error: 'Authorization header required' },
            { status: 401 }
        );
    }

    if (!instrumentKey || !toDate || !fromDate) {
        return NextResponse.json(
            { error: 'Missing required parameters: instrumentKey, toDate, fromDate' },
            { status: 400 }
        );
    }

    try {
        const upstoxUrl = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${interval}/${toDate}/${fromDate}`;

        console.log(`📡 Proxying request to: ${upstoxUrl}`);

        const response = await axios.get(upstoxUrl, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('Historical data proxy error:', error.message);

        // Handle rate limiting specifically
        if (error.response?.status === 429) {
            return NextResponse.json(
                {
                    error: 'Rate limit exceeded. Please wait a moment before retrying.',
                    status: 'RATE_LIMITED'
                },
                { status: 429 }
            );
        }

        // Handle other Upstox API errors
        if (error.response) {
            return NextResponse.json(
                {
                    error: error.response.data?.message || error.message,
                    upstoxStatus: error.response.status
                },
                { status: error.response.status }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to fetch historical data' },
            { status: 500 }
        );
    }
}
