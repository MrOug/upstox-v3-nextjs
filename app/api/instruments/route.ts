import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const exchange = searchParams.get('exchange') || 'NSE';
  
  try {
    // Upstox provides CSV files that are easier to parse
    // CSV format: instrument_key, exchange_token, trading_symbol, name, last_price, expiry, strike, tick_size, lot_size, instrument_type, option_type, isin, exchange
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.csv`;
    
    console.log(`Fetching from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    // Skip header line
    const dataLines = lines.slice(1);
    
    const instrumentMap: Record<string, string> = {};
    let count = 0;
    
    for (const line of dataLines) {
      if (!line.trim()) continue;
      
      // CSV format: instrument_key,exchange_token,trading_symbol,name,...
      const parts = line.split(',');
      
      if (parts.length >= 3) {
        const instrumentKey = parts[0]?.trim();
        const tradingSymbol = parts[2]?.trim();
        
        // Only include equity instruments (NSE_EQ)
        if (instrumentKey && tradingSymbol && instrumentKey.includes(`${exchange}_EQ`)) {
          instrumentMap[tradingSymbol] = instrumentKey;
          count++;
        }
      }
    }
    
    console.log(`✓ Loaded ${count} instruments for ${exchange}`);
    
    return NextResponse.json({
      map: instrumentMap,
      metadata: {
        exchange,
        count: count,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    
    // Return hardcoded fallback for common stocks
    const fallbackMap: Record<string, string> = {
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
    
    console.log('⚠️ Using fallback instrument map');
    
    return NextResponse.json({
      map: fallbackMap,
      metadata: {
        exchange,
        count: Object.keys(fallbackMap).length,
        timestamp: new Date().toISOString(),
        fallback: true,
        error: error.message
      }
    }, { status: 200 }); // Return 200 even with fallback
  }
}
