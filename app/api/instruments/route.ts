import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exchange = searchParams.get('exchange') || 'NSE';
  
  try {
    // Use the non-gzipped complete.json URL instead
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/complete.json`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch instruments: ${response.status}`);
    }
    
    const instruments = await response.json();
    const instrumentMap: Record<string, string> = {};
    
    if (Array.isArray(instruments)) {
      instruments.forEach((item: any) => {
        // Filter by exchange if needed
        if (item.exchange === exchange && item.trading_symbol && item.instrument_key) {
          instrumentMap[item.trading_symbol] = item.instrument_key;
        }
      });
    }
    
    return NextResponse.json({
      map: instrumentMap,
      metadata: {
        exchange,
        count: Object.keys(instrumentMap).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Failed to fetch instruments:', error.message);
    return NextResponse.json(
      { error: error.message, details: 'Try using https://assets.upstox.com/market-quote/instruments/exchange/complete.json directly' },
      { status: 500 }
    );
  }
}
