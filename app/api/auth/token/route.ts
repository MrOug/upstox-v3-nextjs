import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const exchange = searchParams.get('exchange') || 'NSE';

  try {
    console.log(`📥 Downloading ${exchange} instruments from Upstox CDN...`);
    
    // Download from Upstox CDN server-side (no CORS issues)
    const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json`;
    const response = await axios.get(url, { timeout: 30000 });
    
    // Build comprehensive symbol map
    const instruments = response.data;
    const map: Record<string, string> = {};
    const variations: Record<string, string[]> = {};
    let totalCount = 0;
    let equityCount = 0;
    
    for (const inst of instruments) {
      totalCount++;
      
      // Only include equity instruments
      if (inst.instrument_type === 'EQ' && inst.trading_symbol && inst.instrument_key) {
        const symbol = inst.trading_symbol.trim().toUpperCase();
        
        // Primary mapping
        map[symbol] = inst.instrument_key;
        equityCount++;
        
        // Add variations without special characters
        const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '');
        if (cleanSymbol !== symbol) {
          map[cleanSymbol] = inst.instrument_key;
        }
        
        // Remove -EQ suffix if present
        if (symbol.endsWith('-EQ')) {
          const baseSymbol = symbol.replace('-EQ', '');
          map[baseSymbol] = inst.instrument_key;
        }
        
        // Track variations for logging
        if (!variations[symbol]) {
          variations[symbol] = [];
        }
        variations[symbol].push(inst.name || 'Unknown');
      }
    }
    
    console.log(`✓ Processed ${totalCount} total instruments`);
    console.log(`✓ Found ${equityCount} equity instruments`);
    console.log(`✓ Created ${Object.keys(map).length} symbol mappings`);
    
    // Log sample symbols for verification
    const sampleSymbols = Object.keys(map).slice(0, 10);
    console.log('Sample symbols:', sampleSymbols.join(', '));
    
    return NextResponse.json({
      map,
      metadata: {
        exchange,
        totalInstruments: totalCount,
        equityInstruments: equityCount,
        mappings: Object.keys(map).length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error(`❌ Error loading instruments: ${error.message}`);
    return NextResponse.json(
      { 
        error: error.message,
        map: {}
      }, 
      { status: 500 }
    );
  }
}
