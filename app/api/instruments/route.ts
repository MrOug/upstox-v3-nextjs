import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exchange = searchParams.get('exchange') || 'NSE';
  
  try {
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange.toLowerCase()}.json.gz`;
    
    const response = await axios.get(url, {
      responseType: 'json',
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'application/json'
      }
    });
    
    const instruments = response.data;
    const instrumentMap: Record<string, string> = {};
    
    if (Array.isArray(instruments)) {
      instruments.forEach((item: any) => {
        if (item.trading_symbol && item.instrument_key) {
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
      { error: error.message },
      { status: 500 }
    );
  }
}
