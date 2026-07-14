import axios from 'axios';
import { COMPANY_FULL_NAMES, NIFTY_50 } from './constants';

type PerformanceType = 'gainers' | 'losers';
type PerformancePeriod = 'daily' | 'weekly' | 'monthly';

const TOKEN_STORAGE_KEY = 'upstox_access_token';

export class UpstoxAPI {
  private accessToken: string | null = null;
  private instrumentCache: Record<string, any> = {};
  private lastRequestTime = 0;
  private minRequestInterval = 100; // 100ms = 10 requests/second

  constructor() {
    // Try to restore token from localStorage on initialization
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (storedToken) {
        this.accessToken = storedToken;
        console.log('✓ Restored access token from localStorage');
      }
    }
  }

  setAccessToken(token: string) {
    this.accessToken = token;
    // Save to localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      console.log('✓ Access token saved to localStorage');
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearToken() {
    this.accessToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      console.log('✓ Access token removed from localStorage');
    }
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
      // Use proxy route to avoid CORS
      const url = `/api/quotes?instruments=${encodeURIComponent(symbolKey)}&type=ltp`;

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
   * Get top-performing stocks (gainers or losers) for a given period.
   * Daily uses quotes-based calculation; weekly/monthly use historical data.
   */
  async getTopByPerformance(
    type: PerformanceType,
    period: PerformancePeriod,
    limit: number = 50
  ): Promise<string[]> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const isGainer = type === 'gainers';
    const label = `${period} ${type}`;

    if (period === 'daily') {
      return this.getDailyGainersLosers(isGainer, limit, label);
    }
    return this.getHistoricalGainersLosers(isGainer, period, limit, label);
  }

  /** Backend for daily gainers/losers (quotes-based) */
  private async getDailyGainersLosers(isGainer: boolean, limit: number, label: string): Promise<string[]> {
    try {
      const instruments = await this.loadInstruments('NSE');
      const symbols = Object.keys(instruments).slice(0, 500);
      console.log(`📊 Calculating top ${label} from ${symbols.length} stocks...`);

      const quotes = await this.getBatchQuotes(symbols.map(s => instruments[s]));

      const stockChanges = Object.entries(quotes)
        .map(([key, data]: [string, any]) => {
          const symbol = key.split('|')[1] || key.split(':')[1];
          const ltp = data.last_price || data.ltp;
          const prevClose = data.ohlc?.close || data.close || data.prev_close;
          if (!prevClose || prevClose === 0) return null;
          const change = ((ltp - prevClose) / prevClose) * 100;
          return { symbol, change };
        })
        .filter(item => item !== null && (isGainer ? item.change > 0 : item.change < 0))
        .sort((a, b) => isGainer
          ? (b?.change || 0) - (a?.change || 0)
          : (a?.change || 0) - (b?.change || 0))
        .slice(0, limit)
        .map(item => item!.symbol);

      console.log(`✓ Found ${stockChanges.length} top ${label}`);
      return stockChanges;
    } catch (error: any) {
      console.error(`Failed to fetch ${label}:`, error.message);
      return this.getFallbackStocks();
    }
  }

  /** Backend for weekly/monthly gainers/losers (historical data-based) */
  private async getHistoricalGainersLosers(isGainer: boolean, period: 'weekly' | 'monthly', limit: number, label: string): Promise<string[]> {
    try {
      const instruments = await this.loadInstruments('NSE');
      const symbols = Object.keys(instruments).slice(0, 200);
      const interval = period === 'weekly' ? 'weeks' : 'months';
      const lookbackDays = period === 'weekly' ? 14 : 60;

      console.log(`📊 Calculating ${label} from ${symbols.length} stocks...`);

      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const stockChanges: Array<{ symbol: string, change: number }> = [];

      for (let i = 0; i < symbols.length; i += 10) {
        const batch = symbols.slice(i, i + 10);
        const batchPromises = batch.map(async (symbol) => {
          try {
            const instrumentKey = instruments[symbol];
            const data = await this.rateLimitedRequest(() =>
              this.getHistoricalData(instrumentKey, interval, '1', toDate, fromDate)
            );
            if (data.data?.candles?.length >= 2) {
              const candles = data.data.candles;
              const change = ((candles[0][4] - candles[1][4]) / candles[1][4]) * 100;
              return { symbol, change };
            }
            return null;
          } catch (e) {
            return null;
          }
        });

        const results = await Promise.all(batchPromises);
        results.forEach(r => { if (r && (isGainer ? r.change > 0 : r.change < 0)) stockChanges.push(r); });
        await new Promise(r => setTimeout(r, 200));
      }

      const sorted = stockChanges
        .sort((a, b) => isGainer ? b.change - a.change : a.change - b.change)
        .slice(0, limit)
        .map(item => item.symbol);

      console.log(`✓ Found ${sorted.length} top ${label}`);
      return sorted;
    } catch (error: any) {
      console.error(`Failed to fetch ${label}:`, error.message);
      return this.getFallbackStocks();
    }
  }

  /**
   * Get Top Daily Gainers
   */
  async getTopGainers(limit: number = 50): Promise<string[]> {
    return this.getTopByPerformance('gainers', 'daily', limit);
  }

  /**
   * Get Top Daily Losers
   */
  async getTopLosers(limit: number = 50): Promise<string[]> {
    return this.getTopByPerformance('losers', 'daily', limit);
  }

  /**
   * Get Top Weekly Gainers
   */
  async getWeeklyGainers(limit: number = 50): Promise<string[]> {
    return this.getTopByPerformance('gainers', 'weekly', limit);
  }

  /**
   * Get Top Weekly Losers
   */
  async getWeeklyLosers(limit: number = 50): Promise<string[]> {
    return this.getTopByPerformance('losers', 'weekly', limit);
  }

  /**
   * Get Top Monthly Gainers
   */
  async getMonthlyGainers(limit: number = 50): Promise<string[]> {
    return this.getTopByPerformance('gainers', 'monthly', limit);
  }

  /**
   * Get Top Monthly Losers
   */
  async getMonthlyLosers(limit: number = 50): Promise<string[]> {
    return this.getTopByPerformance('losers', 'monthly', limit);
  }

  /**
   * Fallback stocks list (Nifty 50) when API calls fail
   */
  private getFallbackStocks(): string[] {
    console.log('⚠️ Falling back to Nifty 50 stocks');
    return [...NIFTY_50];
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
        // Use proxy route to avoid CORS
        const url = `/api/quotes?instruments=${batch.join(',')}&type=full`;

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
      // Use proxy route to avoid CORS issues
      const response = await axios.get('/api/holdings', {
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

    // Use proxy route to avoid CORS issues
    const url = `/api/historical?instrumentKey=${encodeURIComponent(instrumentKey)}&unit=${unit}&interval=${interval}&toDate=${toDate}&fromDate=${fromDate}`;

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

    // Use proxy route to avoid CORS issues
    const url = `/api/quotes?instruments=${instrumentKeys.join(',')}&type=full`;

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

    // Use proxy route to avoid CORS issues
    const url = `/api/quotes?instruments=${instrumentKeys.join(',')}&type=ltp`;

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

    // Use proxy route to avoid CORS issues
    const url = `/api/quotes?instruments=${instrumentKeys.join(',')}&type=full`;

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