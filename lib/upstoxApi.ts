import axios from 'axios';

export class UpstoxAPI {
  private accessToken: string | null = null;
  private instrumentCache: Record<string, any> = {};

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Load instrument master from Upstox assets (direct download)
   */
  async loadInstruments(exchange: string = 'NSE'): Promise<Record<string, string>> {
    // Check cache first
    if (this.instrumentCache[exchange]) {
      console.log(`✓ Using cached instruments for ${exchange}`);
      return this.instrumentCache[exchange];
    }

    try {
      console.log(`📥 Loading ${exchange} instruments...`);
      
      // Upstox instrument master URL
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
      
      // Build symbol to instrument_key mapping
      if (Array.isArray(instruments)) {
        instruments.forEach((item: any) => {
          if (item.trading_symbol && item.instrument_key) {
            instrumentMap[item.trading_symbol] = item.instrument_key;
          }
        });
      }
      
      // Cache the results
      this.instrumentCache[exchange] = instrumentMap;
      
      console.log(`✓ Loaded ${Object.keys(instrumentMap).length} instrument mappings for ${exchange}`);
      
      return instrumentMap;
    } catch (error: any) {
      console.error(`❌ Failed to load instruments: ${error.message}`);
      
      // Fallback: try via CORS proxy or return empty
      console.log(`💡 Tip: Download instruments from: https://assets.upstox.com/market-quote/instruments/exchange/${exchange.toLowerCase()}.json.gz`);
      return {};
    }
  }

  /**
   * Search for instrument key from loaded instruments (no API call)
   */
  async searchSymbol(symbol: string, exchange: string = 'NSE'): Promise<string | null> {
    try {
      // Load instruments if not cached
      const instruments = await this.loadInstruments(exchange);
      
      // Direct lookup
      if (instruments[symbol]) {
        console.log(`✓ Found ${symbol}:`, instruments[symbol]);
        return instruments[symbol];
      }
      
      // Case-insensitive search
      const upperSymbol = symbol.toUpperCase();
      for (const [key, value] of Object.entries(instruments)) {
        if (key.toUpperCase() === upperSymbol) {
          console.log(`✓ Found ${symbol} (case-insensitive):`, value);
          return value;
        }
      }
      
      console.log(`✗ ${symbol}: Not found in ${exchange}`);
      return null;
    } catch (error: any) {
      console.error(`Search failed for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch historical candle data using V3 API
   */
  async getHistoricalData(
    instrumentKey: string,
    unit: string,
    interval: string,
    toDate: string,
    fromDate: string
  ) {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${interval}/${toDate}/${fromDate}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  }

  /**
   * Get market quote for instrument keys using V3 API
   */
  async getMarketQuote(instrumentKeys: string[]) {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/market-quote/quotes?instrument_key=${instrumentKeys.join(',')}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  }

  /**
   * Get LTP (Last Traded Price) using V3 API
   */
  async getLTP(instrumentKeys: string[]) {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${instrumentKeys.join(',')}`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data;
  }
}

export const upstoxApi = new UpstoxAPI();
