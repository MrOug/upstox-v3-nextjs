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
   * Load instrument master via Next.js API route (server-side, no CORS)
   */
  async loadInstruments(exchange: string = 'NSE'): Promise<Record<string, string>> {
    // Check cache first
    if (this.instrumentCache[exchange]) {
      console.log(`✓ Using cached instruments for ${exchange}`);
      return this.instrumentCache[exchange];
    }

    try {
      console.log(`📥 Loading ${exchange} instruments via API route...`);
      const response = await axios.get(`/api/instruments?exchange=${exchange}`);
      
      // Extract map from response
      const data = response.data.map || response.data;
      
      // Cache the results
      this.instrumentCache[exchange] = data;
      
      console.log(`✓ Loaded ${Object.keys(data).length} instrument mappings`);
      
      // Log metadata if available
      if (response.data.metadata) {
        console.log('Metadata:', response.data.metadata);
      }
      
      return data;
    } catch (error: any) {
      console.error(`❌ Failed to load instruments: ${error.message}`);
      return {};
    }
  }

  /**
   * Search for instrument using V2 API (fallback for missing symbols)
   */
  async searchSymbol(symbol: string, exchange: string = 'NSE'): Promise<string | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const url = `https://api.upstox.com/v2/search?query=${encodeURIComponent(symbol)}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      const results = response.data;
      
      if (results && Array.isArray(results) && results.length > 0) {
        // Find exact match for the exchange
        const exactMatch = results.find((item: any) => 
          item.trading_symbol === symbol && 
          item.instrument_key?.startsWith(exchange)
        );
        
        if (exactMatch) {
          console.log(`✓ Found ${symbol} via API search:`, exactMatch.instrument_key);
          return exactMatch.instrument_key;
        }
        
        // Try first result from the exchange
        const firstMatch = results.find((item: any) => 
          item.instrument_key?.startsWith(exchange)
        );
        
        if (firstMatch) {
          console.log(`✓ Found similar to ${symbol}:`, firstMatch.instrument_key);
          return firstMatch.instrument_key;
        }
      }
      
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
   * Search using V2 API
   */
  async searchStock(query: string) {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v2/search?query=${encodeURIComponent(query)}`;
    
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
