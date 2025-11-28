import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const exchange = searchParams.get('exchange') || 'NSE';

  try {
    console.log(`Downloading ${exchange} instruments from Upstox CDN...`);
    
    // Download from Upstox CDN server-side (no CORS issues)
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json`;
    const response = await axios.get(url);
    
    // Build symbol-to-instrumentKey map
    const instruments = response.data;
    const map: Record<string, string> = {};
    
    for (const inst of instruments) {
      if (inst.instrument_type === 'EQ' && inst.trading_symbol && inst.instrument_key) {
        map[inst.trading_symbol] = inst.instrument_key;
      }
    }
    
    console.log(`✓ Loaded ${Object.keys(map).length} ${exchange} equity instruments`);
    
    return NextResponse.json(map);
  } catch (error: any) {
    console.error(`Error loading instruments: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
