import axios from 'axios';

export class UpstoxAPI {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Search for instrument key using V3 search API
   * Returns instrument_key for the symbol
   */
  async searchInstrumentKey(symbol: string, exchange: string = 'NSE_EQ'): Promise<string | null> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const url = `https://api.upstox.com/v2/market-quote/quotes?symbol=${exchange}%7C${symbol}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      // Extract instrument key from response
      const data = response.data?.data;
      if (data && Object.keys(data).length > 0) {
        const firstKey = Object.keys(data)[0];
        return firstKey; // This is the instrument_key
      }

      return null;
    } catch (error) {
      console.error(`Search failed for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Fetch historical candle data using V3 API format
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
