import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { INSTRUMENTS as STATIC_INSTRUMENTS } from '@/lib/constants';

let cachedInstruments: Record<string, string> | null = null;
let cacheLoadTime: number = 0;
const CACHE_DURATION = 86400000; // 24 hours

interface Instrument {
  trading_symbol: string;
  instrument_key: string;
  segment: string;
}

function loadInstrumentsFromFile(): Record<string, string> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'instruments.json');
    
    if (!fs.existsSync(filePath)) {
      throw new Error('instruments.json not found in public folder');
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const instruments: Instrument[] = JSON.parse(fileContent);
    
    const map: Record<string, string> = {};
    
    instruments.forEach((item) => {
      if (item.trading_symbol && item.instrument_key) {
        if (item.segment === 'NSE_EQ') {
          map[item.trading_symbol] = item.instrument_key;
        }
      }
    });
    
    console.log(`✓ Loaded ${Object.keys(map).length} NSE_EQ instruments`);
    return map;
  } catch (error: any) {
    console.error('Failed to load instruments:', error.message);
    throw error;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const exchange = searchParams.get('exchange') || 'NSE';
  
  try {
    if (!cachedInstruments || Date.now() - cacheLoadTime > CACHE_DURATION) {
      cachedInstruments = loadInstrumentsFromFile();
      cacheLoadTime = Date.now();
    }
    
    if (symbol) {
      const instrumentKey = cachedInstruments[symbol.toUpperCase()];
      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        instrument_key: instrumentKey || null,
        found: !!instrumentKey
      });
    }
    
    return NextResponse.json({
      map: cachedInstruments,
      metadata: {
        exchange,
        count: Object.keys(cachedInstruments).length,
        timestamp: new Date(cacheLoadTime).toISOString(),
        source: 'local_file'
      }
    });
  } catch (error: any) {
    // Fallback to full NSE_EQ instrument map from constants
    console.warn('Falling back to static NSE_EQ instrument map:', error.message);
    return NextResponse.json({
      map: STATIC_INSTRUMENTS.NSE_EQ,
      metadata: {
        exchange,
        count: Object.keys(STATIC_INSTRUMENTS.NSE_EQ).length,
        timestamp: new Date().toISOString(),
        source: 'static_fallback',
        error: error.message
      }
    });
  }
}
