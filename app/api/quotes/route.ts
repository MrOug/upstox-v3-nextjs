import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * API Proxy for Upstox Market Quotes
 * This route proxies requests to Upstox API to avoid CORS issues in the browser.
 * 
 * Query Parameters:
 * - instruments: Comma-separated list of instrument keys
 * - type: Quote type ('full', 'ltp', 'ohlc') - defaults to 'full'
 * 
 * Headers:
 * - Authorization: Bearer token from Upstox
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const instruments = searchParams.get('instruments');
    const quoteType = searchParams.get('type') || 'full';

    // Get authorization header from request
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
        return NextResponse.json(
            { error: 'Authorization header required' },
            { status: 401 }
        );
    }

    if (!instruments) {
        return NextResponse.json(
            { error: 'Missing required parameter: instruments' },
            { status: 400 }
        );
    }

    try {
        let upstoxUrl: string;

        // Upstox uses v3 for all market quote endpoints
        switch (quoteType) {
            case 'ltp':
                upstoxUrl = `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${instruments}`;
                break;
            case 'ohlc':
                upstoxUrl = `https://api.upstox.com/v3/market-quote/ohlc?instrument_key=${instruments}`;
                break;
            default:
                upstoxUrl = `https://api.upstox.com/v3/market-quote/quotes?instrument_key=${instruments}`;
        }

        console.log(`📡 Proxying quote request to: ${upstoxUrl}`);

        const response = await axios.get(upstoxUrl, {
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
            },
            timeout: 30000
        });

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('Quote proxy error:', error.message);

        if (error.response?.status === 429) {
            return NextResponse.json(
                {
                    error: 'Rate limit exceeded. Please wait a moment before retrying.',
                    status: 'RATE_LIMITED'
                },
                { status: 429 }
            );
        }

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
            { error: error.message || 'Failed to fetch quotes' },
            { status: 500 }
        );
    }
}
