import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exchange = searchParams.get('exchange') || 'NSE';
  
  try {
    // Upstox provides instruments in JSON format (NOT gzipped)
    // Use the exchange-specific URL
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json`;
    
    console.log(`Fetching instruments from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      cache: 'no-store' // Don't cache during development
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    console.log(`Content-Type: ${contentType}`);
    
    const instruments = await response.json();
    
    if (!Array.isArray(instruments)) {
      throw new Error('Invalid response format: expected array');
    }
    
    const instrumentMap: Record<string, string> = {};
    
    // Build trading_symbol -> instrument_key mapping
    instruments.forEach((item: any) => {
      if (item.trading_symbol && item.instrument_key) {
        // Only include equity instruments for NSE_EQ
        if (item.segment === `${exchange}_EQ`) {
          instrumentMap[item.trading_symbol] = item.instrument_key;
        }
      }
    });
    
    console.log(`Loaded ${Object.keys(instrumentMap).length} instruments for ${exchange}`);
    
    return NextResponse.json({
      map: instrumentMap,
      metadata: {
        exchange,
        count: Object.keys(instrumentMap).length,
        timestamp: new Date().toISOString(),
        totalInstruments: instruments.length
      }
    });
  } catch (error: any) {
    console.error('Failed to fetch instruments:', error);
    return NextResponse.json(
      { 
        error: error.message,
        url: `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json`,
        tip: 'Ensure the URL is accessible and returns valid JSON'
      },
      { status: 500 }
    );
  }
}
