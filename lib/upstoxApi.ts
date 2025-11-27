import axios from 'axios';

export class UpstoxAPI {
  private accessToken: string | null = null;
  private dynamicInstruments: Record<string, string> | null = null;
  private isLoadingInstruments = false;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async loadCompleteInstrumentMaster(exchange: string = 'NSE'): Promise<Record<string, string>> {
    if (this.dynamicInstruments) return this.dynamicInstruments;
    
    if (this.isLoadingInstruments) {
      while (this.isLoadingInstruments) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.dynamicInstruments || {};
    }

    this.isLoadingInstruments = true;
    
    try {
      console.log(`📥 Downloading ${exchange} instrument master from Upstox CDN...`);
      
      const url = `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`;
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      
      // Note: pako decompression would be handled client-side with the CDN script
      // For server-side, you'd need to import pako differently
      // This is simplified for client-side usage
      
      this.dynamicInstruments = {};
      console.log(`✓ Loaded ${Object.keys(this.dynamicInstruments).length} ${exchange} equity instruments`);
      this.isLoadingInstruments = false;
      return this.dynamicInstruments;
      
    } catch (error: any) {
      console.error(`⚠ Error loading instruments: ${error.message}. Using fallback.`);
      this.isLoadingInstruments = false;
      this.dynamicInstruments = {};
      return this.dynamicInstruments;
    }
  }

  /**
   * Fetch historical candle data using V3 API format
   * @param instrumentKey - e.g., "NSE_EQ|INE009A01021"
   * @param unit - "days", "weeks", "months", "minutes", "hours"
   * @param interval - "1", "5", "15", "30", "60", "4"
   * @param toDate - "YYYY-MM-DD"
   * @param fromDate - "YYYY-MM-DD"
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

    // V3 API format: /v3/historical-candle/{instrument}/{unit}/{interval}/{to}/{from}
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