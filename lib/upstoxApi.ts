import axios from 'axios';

export class UpstoxAPI {
  private accessToken: string | null = null;
  private instrumentCache: Record<string, Record<string, string>> = {};

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
      console.log(`Using cached instruments for ${exchange}`);
      return this.instrumentCache[exchange];
    }

    try {
      console.log(`Loading ${exchange} instruments via API route...`);
      const response = await axios.get(`/api/instruments?exchange=${exchange}`);
      
      // Cache the results
      this.instrumentCache[exchange] = response.data;
      
      console.log(`✓ Loaded ${Object.keys(response.data).length} instruments`);
      return response.data;
    } catch (error: any) {
      console.error(`Failed to load instruments: ${error.message}`);
      return {};
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
   * Search using V2 API (V3 doesn't have search)
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
