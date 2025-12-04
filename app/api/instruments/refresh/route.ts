import { NextResponse } from 'next/server';
import pako from 'pako';

/**
 * API route to fetch fresh instrument master from Upstox
 * This replaces the static instruments.json with live data
 */

interface Instrument {
    trading_symbol: string;
    instrument_key: string;
    segment: string;
    exchange: string;
    isin?: string;
    name?: string;
    instrument_type?: string;
    lot_size?: number;
    tick_size?: number;
}

let cachedInstruments: Record<string, string> | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange') || 'NSE';
    const forceRefresh = searchParams.get('refresh') === 'true';

    try {
        // Check cache
        if (!forceRefresh && cachedInstruments && (Date.now() - lastFetchTime < CACHE_DURATION)) {
            console.log('✓ Using cached instruments from API fetch');
            return NextResponse.json({
                map: cachedInstruments,
                metadata: {
                    exchange,
                    count: Object.keys(cachedInstruments).length,
                    timestamp: new Date(lastFetchTime).toISOString(),
                    source: 'api_cache'
                }
            });
        }

        console.log(`📥 Fetching fresh ${exchange} instruments from Upstox...`);

        // Fetch from Upstox instrument master
        const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`;

        const response = await fetch(url, {
            headers: {
                'Accept-Encoding': 'gzip'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch instruments: ${response.status}`);
        }

        // Get the compressed data
        const arrayBuffer = await response.arrayBuffer();
        const compressed = new Uint8Array(arrayBuffer);

        // Decompress using pako
        let jsonString: string;
        try {
            const decompressed = pako.ungzip(compressed);
            jsonString = new TextDecoder().decode(decompressed);
        } catch (decompressError) {
            // If decompression fails, try parsing as plain JSON
            jsonString = new TextDecoder().decode(compressed);
        }

        // Parse JSON
        const instruments: Instrument[] = JSON.parse(jsonString);

        // Build symbol to instrument_key map for equities
        const map: Record<string, string> = {};
        instruments.forEach((item) => {
            if (item.trading_symbol && item.instrument_key) {
                // Only include equity segment
                if (item.segment === `${exchange}_EQ` || item.instrument_type === 'EQ') {
                    map[item.trading_symbol] = item.instrument_key;
                }
            }
        });

        cachedInstruments = map;
        lastFetchTime = Date.now();

        console.log(`✓ Loaded ${Object.keys(map).length} ${exchange}_EQ instruments from API`);

        return NextResponse.json({
            map,
            metadata: {
                exchange,
                count: Object.keys(map).length,
                timestamp: new Date().toISOString(),
                source: 'api_fresh',
                totalInstruments: instruments.length
            }
        });

    } catch (error: any) {
        console.error('Failed to fetch instruments from API:', error.message);

        // Return cached data if available, even if expired
        if (cachedInstruments) {
            return NextResponse.json({
                map: cachedInstruments,
                metadata: {
                    exchange,
                    count: Object.keys(cachedInstruments).length,
                    timestamp: new Date(lastFetchTime).toISOString(),
                    source: 'stale_cache',
                    error: error.message
                }
            });
        }

        // Final fallback - minimal set of popular stocks
        const fallback: Record<string, string> = {
            'RELIANCE': 'NSE_EQ|INE002A01018',
            'TCS': 'NSE_EQ|INE467B01029',
            'HDFCBANK': 'NSE_EQ|INE040A01034',
            'INFY': 'NSE_EQ|INE009A01021',
            'ICICIBANK': 'NSE_EQ|INE090A01021',
            'HINDUNILVR': 'NSE_EQ|INE030A01027',
            'ITC': 'NSE_EQ|INE154A01025',
            'SBIN': 'NSE_EQ|INE062A01020',
            'BHARTIARTL': 'NSE_EQ|INE397D01024',
            'KOTAKBANK': 'NSE_EQ|INE237A01028'
        };

        return NextResponse.json({
            map: fallback,
            metadata: {
                exchange,
                count: Object.keys(fallback).length,
                timestamp: new Date().toISOString(),
                source: 'fallback',
                error: error.message
            }
        }, { status: 200 }); // Return 200 with fallback data
    }
}
