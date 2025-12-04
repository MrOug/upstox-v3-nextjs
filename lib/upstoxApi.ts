import axios from 'axios';
import { COMPANY_FULL_NAMES } from './constants';

export class UpstoxAPI {
  private accessToken: string | null = null;
  private instrumentCache: Record<string, any> = {};
  private lastRequestTime = 0;
  private minRequestInterval = 100; // 100ms = 10 requests/second

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Rate limiting helper
   */
  private async rateLimitedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();
    return requestFn();
  }

  /**
   * Convert company name to symbol
   * Example: "State Bank of India" → "SBIN"
   */
  private companyNameToSymbol(input: string): string | null {
    // Direct symbol check first
    if (input.length <= 15 && input === input.toUpperCase()) {
      return input;
    }

    // Normalize input for comparison
    const normalizedInput = input.toLowerCase().trim();
    
    // Search in COMPANY_FULL_NAMES
    for (const [symbol, fullName] of Object.entries(COMPANY_FULL_NAMES)) {
      if (fullName.toLowerCase() === normalizedInput) {
        console.log(`✓ Found exact match: "${input}" → ${symbol}`);
        return symbol;
      }
    }
    
    // Partial match (e.g., "State Bank" matches "State Bank of India")
    for (const [symbol, fullName] of Object.entries(COMPANY_FULL_NAMES)) {
      if (fullName.toLowerCase().includes(normalizedInput) || 
          normalizedInput.includes(fullName.toLowerCase())) {
        console.log(`✓ Found partial match: "${input}" → ${symbol} (${fullName})`);
        return symbol;
      }
    }
    
    // Check if it's already a symbol
    const upperInput = input.toUpperCase().replace(/[^A-Z0-9&-]/g, '');
    if (COMPANY_FULL_NAMES[upperInput]) {
      console.log(`✓ Found symbol match: "${input}" → ${upperInput}`);
      return upperInput;
    }
    
    console.log(`✗ No match found for: "${input}"`);
    return null;
  }

  /**
   * Load instrument master via Next.js API route (server-side, no CORS)
   */
  async loadInstruments(exchange: string = 'NSE'): Promise<Record<string, string>> {
    if (this.instrumentCache[exchange]) {
      console.log(`✓ Using cached instruments for ${exchange}`);
      return this.instrumentCache[exchange];
    }

    try {
      console.log(`📥 Loading ${exchange} instruments via API route...`);
      const response = await axios.get(`/api/instruments?exchange=${exchange}`);
      
      const data = response.data.map || response.data;
      this.instrumentCache[exchange] = data;
      
      console.log(`✓ Loaded ${Object.keys(data).length} instrument mappings`);
      
      if (response.data.metadata) {
        console.log('Metadata:', response.data.metadata);
      }
      
      return data;
    } catch (error: any) {
      console.error(`✖ Failed to load instruments: ${error.message}`);
      return {};
    }
  }

  /**
   * Search for instrument key - supports both symbols and company names
   * Examples: "SBIN", "State Bank of India", "TCS", "Tata Consultancy Services"
   */
  async searchSymbol(input: string, exchange: string = 'NSE'): Promise<string | null> {
    try {
      // Step 1: Convert company name to symbol if needed
      let symbol = this.companyNameToSymbol(input);
      
      if (!symbol) {
        // Try as-is if conversion failed
        symbol = input.toUpperCase().replace(/[^A-Z0-9&-]/g, '');
      }
      
      console.log(`🔍 Searching for: "${input}" → Symbol: ${symbol}`);
      
      // Step 2: Load instruments from JSON
      const instruments = await this.loadInstruments(exchange);
      
      // Step 3: Check exact match
      if (instruments[symbol]) {
        console.log(`✓ Found ${symbol} in local file:`, instruments[symbol]);
        return instruments[symbol];
      }
      
      // Step 4: Case-insensitive search
      for (const [key, value] of Object.entries(instruments)) {
        if (key.toUpperCase() === symbol.toUpperCase()) {
          console.log(`✓ Found ${symbol} (case-insensitive):`, value);
          return value;
        }
      }
      
      // Step 5: Try Upstox API as fallback
      if (this.accessToken) {
        console.log(`🔍 ${symbol} not in local file, searching via Upstox API...`);
        const apiResult = await this.searchViaUpstoxAPI(symbol, exchange);
        
        if (apiResult) {
          instruments[symbol.toUpperCase()] = apiResult;
          this.instrumentCache[exchange] = instruments;
          return apiResult;
        }
      }
      
      console.log(`✗ "${input}" (${symbol}): Not found in local file or API`);
      return null;
    } catch (error: any) {
      console.error(`Search failed for "${input}":`, error.message);
      return null;
    }
  }

  /**
   * Search via Upstox API
   */
  private async searchViaUpstoxAPI(symbol: string, exchange: string = 'NSE'): Promise<string | null> {
    if (!this.accessToken) {
      console.warn('No access token - cannot search via API');
      return null;
    }

    try {
      const symbolKey = `${exchange}_EQ|${symbol.toUpperCase()}`;
      const url = `https://api.upstox.com/v2/market-quote/ltp?symbol=${symbolKey}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.data.data && response.data.data[symbolKey]) {
        const instrumentKey = symbolKey.replace(':', '|');
        console.log(`✓ Found ${symbol} via API:`, instrumentKey);
        return instrumentKey;
      }
      
      return null;
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 404) {
        console.log(`✗ ${symbol} not found via API`);
        return null;
      }
      
      console.error(`API search error for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get Top Gainers - Calculate from market data (Upstox has no direct API)
   * Uses Nifty 500 universe and calculates % change from previous close
   */
  async getTopGainers(limit: number = 50): Promise<string[]> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      // Since there's no direct API, fetch from a stock universe
      // Using Nifty 500 as the universe (you can adjust this)
      const instruments = await this.loadInstruments('NSE');
      const symbols = Object.keys(instruments).slice(0, 500); // Get first 500 stocks
      
      console.log(`📊 Calculating top gainers from ${symbols.length} stocks...`);
      
      // Fetch quotes in batches of 100 (API limit)
      const quotes = await this.getBatchQuotes(symbols.map(s => instruments[s]));
      
      // Calculate % change and sort
      const stockChanges = Object.entries(quotes)
        .map(([key, data]: [string, any]) => {
          const symbol = key.split('|')[1] || key.split(':')[1];
          const ltp = data.last_price || data.ltp;
          const prevClose = data.ohlc?.close || data.close || data.prev_close;
          
          if (!prevClose || prevClose === 0) return null;
          
          const change = ((ltp - prevClose) / prevClose) * 100;
          return { symbol, change, ltp, prevClose };
        })
        .filter(item => item !== null && item.change > 0) // Only gainers
        .sort((a, b) => (b?.change || 0) - (a?.change || 0)) // Sort descending
        .slice(0, limit)
        .map(item => item!.symbol);

      console.log(`✓ Fetched ${stockChanges.length} top gainers`);
      return stockChanges;
    } catch (error: any) {
      console.error('Failed to fetch top gainers:', error.message);
      // Fallback to Nifty 50 if calculation fails
      console.log('⚠️ Falling back to Nifty 50 stocks');
      return ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','ITC','SBIN','BHARTIARTL','KOTAKBANK','BAJFINANCE','LT','ASIANPAINT','AXISBANK','MARUTI','TITAN','SUNPHARMA','ULTRACEMCO','NESTLEIND','WIPRO','HCLTECH','TECHM','POWERGRID','NTPC','BAJAJFINSV','M&M','ONGC','TATASTEEL','ADANIPORTS','JSWSTEEL','INDUSINDBK','GRASIM','TATAMOTORS','DIVISLAB','DRREDDY','BRITANNIA','CIPLA','EICHERMOT','HINDALCO','BPCL','COALINDIA','HEROMOTOCO','UPL','SHREECEM','APOLLOHOSP','SBILIFE','BAJAJ-AUTO','ADANIENT','HDFCLIFE','TATACONSUM'];
    }
  }

  /**
   * Get Top Losers - Calculate from market data
   */
  async getTopLosers(limit: number = 50): Promise<string[]> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const instruments = await this.loadInstruments('NSE');
      const symbols = Object.keys(instruments).slice(0, 500);
      
      console.log(`📊 Calculating top losers from ${symbols.length} stocks...`);
      
      const quotes = await this.getBatchQuotes(symbols.map(s => instruments[s]));
      
      const stockChanges = Object.entries(quotes)
        .map(([key, data]: [string, any]) => {
          const symbol = key.split('|')[1] || key.split(':')[1];
          const ltp = data.last_price || data.ltp;
          const prevClose = data.ohlc?.close || data.close || data.prev_close;
          
          if (!prevClose || prevClose === 0) return null;
          
          const change = ((ltp - prevClose) / prevClose) * 100;
          return { symbol, change, ltp, prevClose };
        })
        .filter(item => item !== null && item.change < 0) // Only losers
        .sort((a, b) => (a?.change || 0) - (b?.change || 0)) // Sort ascending (most negative first)
        .slice(0, limit)
        .map(item => item!.symbol);

      console.log(`✓ Fetched ${stockChanges.length} top losers`);
      return stockChanges;
    } catch (error: any) {
      console.error('Failed to fetch top losers:', error.message);
      console.log('⚠️ Falling back to Nifty 50 stocks');
      return ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','ITC','SBIN','BHARTIARTL','KOTAKBANK','BAJFINANCE','LT','ASIANPAINT','AXISBANK','MARUTI','TITAN','SUNPHARMA','ULTRACEMCO','NESTLEIND','WIPRO','HCLTECH','TECHM','POWERGRID','NTPC','BAJAJFINSV','M&M','ONGC','TATASTEEL','ADANIPORTS','JSWSTEEL','INDUSINDBK','GRASIM','TATAMOTORS','DIVISLAB','DRREDDY','BRITANNIA','CIPLA','EICHERMOT','HINDALCO','BPCL','COALINDIA','HEROMOTOCO','UPL','SHREECEM','APOLLOHOSP','SBILIFE','BAJAJ-AUTO','ADANIENT','HDFCLIFE','TATACONSUM'];
    }
  }

  /**
   * Get batch quotes for multiple instruments (max 100 per request)
   */
  private async getBatchQuotes(instrumentKeys: string[]): Promise<Record<string, any>> {
    const batches = [];
    for (let i = 0; i < instrumentKeys.length; i += 100) {
      batches.push(instrumentKeys.slice(i, i + 100));
    }
    
    const results: Record<string, any> = {};
    
    for (const batch of batches) {
      try {
        const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${batch.join(',')}`;
        
        const response = await this.rateLimitedRequest(() => 
          axios.get(url, {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Accept': 'application/json'
            }
          })
        );
        
        if (response.data.data) {
          Object.assign(results, response.data.data);
        }
      } catch (error: any) {
        console.error('Batch quote error:', error.message);
      }
    }
    
    return results;
  }

  /**
   * Get user's holdings from Upstox
   */
  async getHoldings(): Promise<string[]> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    try {
      const url = 'https://api.upstox.com/v2/portfolio/long-term-holdings';
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      const holdings = response.data.data || [];
      const symbols = holdings.map((h: any) => h.trading_symbol).filter(Boolean);
      
      console.log(`✓ Fetched ${symbols.length} holdings`);
      return symbols;
    } catch (error: any) {
      console.error('Failed to fetch holdings:', error.message);
      return [];
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

  /**
   * Get full market quote for multiple instruments (batch)
   */
  async getFullMarketQuote(instrumentKeys: string[]) {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${instrumentKeys.join(',')}`;
    
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