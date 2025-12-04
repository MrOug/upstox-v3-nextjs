import axios, { AxiosError } from 'axios';
import { COMPANY_FULL_NAMES } from './constants';

// ============================================
// Types for Upstox API Responses (V3)
// ============================================

interface LTPData {
  ltp: number;
  ltq?: number;
  volume?: number;
  cp?: number;
  instrument_token?: string;
}

interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface QuoteData {
  ltp: number;
  volume: number;
  oi?: number;
  ohlc: OHLCData;
  depth?: {
    buy: { price: number; quantity: number; orders: number }[];
    sell: { price: number; quantity: number; orders: number }[];
  };
  timestamp?: string;
  last_trade_time?: string;
  lower_circuit_limit?: number;
  upper_circuit_limit?: number;
  net_change?: number;
}

interface CandleData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
}

interface HoldingData {
  isin: string;
  trading_symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

interface TokenData {
  accessToken: string;
  expiresAt: number;
}

// ============================================
// Retry Configuration
// ============================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

// ============================================
// Storage Keys
// ============================================

const STORAGE_KEYS = {
  TOKEN: 'upstox_token_data',
  INSTRUMENTS_CACHE: 'upstox_instruments_cache',
  INSTRUMENTS_TIMESTAMP: 'upstox_instruments_timestamp'
};

// ============================================
// Main API Class
// ============================================

export class UpstoxAPI {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private instrumentCache: Record<string, Record<string, string>> = {};
  private lastRequestTime = 0;
  private minRequestInterval = 200; // 200ms = 5 requests/second (more conservative)
  private circuitBreakerFailures = 0;
  private circuitBreakerOpenUntil = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 20; // More lenient - allow 20 failures before opening
  private readonly CIRCUIT_BREAKER_RESET_MS = 15000; // Reset after 15 seconds

  constructor() {
    // Load token from localStorage on initialization (client-side only)
    if (typeof window !== 'undefined') {
      this.loadTokenFromStorage();
    }
  }

  // ============================================
  // Token Management with Persistence
  // ============================================

  setAccessToken(token: string, expiresInSeconds: number = 86400) {
    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + (expiresInSeconds * 1000);

    // Persist to localStorage
    if (typeof window !== 'undefined') {
      const tokenData: TokenData = {
        accessToken: token,
        expiresAt: this.tokenExpiresAt
      };
      localStorage.setItem(STORAGE_KEYS.TOKEN, JSON.stringify(tokenData));
      console.log('✓ Token saved to storage, expires:', new Date(this.tokenExpiresAt).toLocaleString());
    }
  }

  getAccessToken(): string | null {
    // Check if token is expired
    if (this.accessToken && this.tokenExpiresAt > 0) {
      if (Date.now() >= this.tokenExpiresAt) {
        console.log('⚠️ Token expired, clearing...');
        this.clearToken();
        return null;
      }
    }
    return this.accessToken;
  }

  isTokenValid(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiresAt;
  }

  getTokenExpiryTime(): number {
    return this.tokenExpiresAt;
  }

  getTokenRemainingMs(): number {
    if (!this.tokenExpiresAt) return 0;
    return Math.max(0, this.tokenExpiresAt - Date.now());
  }

  clearToken() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      console.log('✓ Token cleared from storage');
    }
  }

  private loadTokenFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (stored) {
        const tokenData: TokenData = JSON.parse(stored);
        if (tokenData.expiresAt > Date.now()) {
          this.accessToken = tokenData.accessToken;
          this.tokenExpiresAt = tokenData.expiresAt;
          console.log('✓ Token restored from storage, expires:', new Date(this.tokenExpiresAt).toLocaleString());
        } else {
          console.log('⚠️ Stored token expired, clearing...');
          localStorage.removeItem(STORAGE_KEYS.TOKEN);
        }
      }
    } catch (e) {
      console.error('Failed to load token from storage:', e);
    }
  }

  // ============================================
  // Circuit Breaker Pattern
  // ============================================

  private isCircuitOpen(): boolean {
    if (this.circuitBreakerOpenUntil > Date.now()) {
      return true;
    }
    // Reset failures if circuit was open and cooldown passed
    if (this.circuitBreakerOpenUntil > 0 && Date.now() >= this.circuitBreakerOpenUntil) {
      this.circuitBreakerFailures = 0;
      this.circuitBreakerOpenUntil = 0;
    }
    return false;
  }

  private recordSuccess() {
    this.circuitBreakerFailures = 0;
  }

  private recordFailure() {
    this.circuitBreakerFailures++;
    if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreakerOpenUntil = Date.now() + this.CIRCUIT_BREAKER_RESET_MS;
      console.log(`🔴 Circuit breaker OPEN until ${new Date(this.circuitBreakerOpenUntil).toLocaleTimeString()}`);
    }
  }

  // ============================================
  // Rate Limiting
  // ============================================

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

  // ============================================
  // Retry Logic with Exponential Backoff
  // ============================================

  private async retryWithBackoff<T>(
    requestFn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is open. Please wait before retrying.');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await this.rateLimitedRequest(requestFn);
        this.recordSuccess();
        return result;
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;

        // Handle token expiry
        if (status === 401) {
          console.log('⚠️ Token expired (401), clearing session...');
          this.clearToken();
          throw new Error('Session expired. Please login again.');
        }

        // Check if retryable
        const isRetryable = config.retryableStatuses.includes(status) ||
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND';

        if (!isRetryable || attempt === config.maxRetries) {
          this.recordFailure();
          throw error;
        }

        // Calculate delay with exponential backoff + jitter
        const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        const delay = Math.min(exponentialDelay + jitter, config.maxDelayMs);

        console.log(`⚠️ Request failed (${status || error.code}), retrying in ${Math.round(delay)}ms... (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.recordFailure();
    throw lastError || new Error('Max retries exceeded');
  }

  // ============================================
  // Symbol/Company Name Utilities
  // ============================================

  private companyNameToSymbol(input: string): string | null {
    if (input.length <= 15 && input === input.toUpperCase()) {
      return input;
    }

    const normalizedInput = input.toLowerCase().trim();

    for (const [symbol, fullName] of Object.entries(COMPANY_FULL_NAMES)) {
      if (fullName.toLowerCase() === normalizedInput) {
        console.log(`✓ Found exact match: "${input}" → ${symbol}`);
        return symbol;
      }
    }

    for (const [symbol, fullName] of Object.entries(COMPANY_FULL_NAMES)) {
      if (fullName.toLowerCase().includes(normalizedInput) ||
        normalizedInput.includes(fullName.toLowerCase())) {
        console.log(`✓ Found partial match: "${input}" → ${symbol} (${fullName})`);
        return symbol;
      }
    }

    const upperInput = input.toUpperCase().replace(/[^A-Z0-9&-]/g, '');
    if (COMPANY_FULL_NAMES[upperInput]) {
      console.log(`✓ Found symbol match: "${input}" → ${upperInput}`);
      return upperInput;
    }

    console.log(`✗ No match found for: "${input}"`);
    return null;
  }

  // ============================================
  // Instrument Master Loading
  // ============================================

  async loadInstruments(exchange: string = 'NSE'): Promise<Record<string, string>> {
    if (this.instrumentCache[exchange]) {
      console.log(`✓ Using cached instruments for ${exchange}`);
      return this.instrumentCache[exchange];
    }

    try {
      console.log(`📥 Loading ${exchange} instruments via API route...`);
      const response = await this.retryWithBackoff(() =>
        axios.get(`/api/instruments?exchange=${exchange}`)
      );

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

  async searchSymbol(input: string, exchange: string = 'NSE'): Promise<string | null> {
    try {
      let symbol = this.companyNameToSymbol(input);

      if (!symbol) {
        symbol = input.toUpperCase().replace(/[^A-Z0-9&-]/g, '');
      }

      console.log(`🔍 Searching for: "${input}" → Symbol: ${symbol}`);

      const instruments = await this.loadInstruments(exchange);

      if (instruments[symbol]) {
        console.log(`✓ Found ${symbol} in local file:`, instruments[symbol]);
        return instruments[symbol];
      }

      for (const [key, value] of Object.entries(instruments)) {
        if (key.toUpperCase() === symbol.toUpperCase()) {
          console.log(`✓ Found ${symbol} (case-insensitive):`, value);
          return value;
        }
      }

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

  private async searchViaUpstoxAPI(symbol: string, exchange: string = 'NSE'): Promise<string | null> {
    if (!this.accessToken) {
      console.warn('No access token - cannot search via API');
      return null;
    }

    try {
      const symbolKey = `${exchange}_EQ|${symbol.toUpperCase()}`;
      // Using V3 endpoint
      const url = `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${encodeURIComponent(symbolKey)}`;

      const response = await this.retryWithBackoff(() =>
        axios.get(url, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        })
      );

      if (response.data.data && response.data.data[symbolKey]) {
        console.log(`✓ Found ${symbol} via API:`, symbolKey);
        return symbolKey;
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

  // ============================================
  // V3 Market Data APIs
  // ============================================

  /**
   * Get LTP (Last Traded Price) using V3 API
   * V3 includes: ltp, ltq (last traded qty), volume, cp (closing price)
   */
  async getLTP(instrumentKeys: string[]): Promise<Record<string, LTPData>> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${instrumentKeys.map(k => encodeURIComponent(k)).join(',')}`;

    const response = await this.retryWithBackoff(() =>
      axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      })
    );

    return response.data.data || {};
  }

  /**
   * Get full market quotes using V3 API
   */
  async getMarketQuote(instrumentKeys: string[]): Promise<Record<string, QuoteData>> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/market-quote/quotes?instrument_key=${instrumentKeys.map(k => encodeURIComponent(k)).join(',')}`;

    const response = await this.retryWithBackoff(() =>
      axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      })
    );

    return response.data.data || {};
  }

  /**
   * Get OHLC data using V3 API
   */
  async getOHLC(instrumentKeys: string[]): Promise<Record<string, OHLCData>> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/market-quote/ohlc?instrument_key=${instrumentKeys.map(k => encodeURIComponent(k)).join(',')}`;

    const response = await this.retryWithBackoff(() =>
      axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      })
    );

    return response.data.data || {};
  }

  /**
   * Fetch historical candle data using V3 API
   */
  async getHistoricalData(
    instrumentKey: string,
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months',
    interval: string,
    toDate: string,
    fromDate: string
  ): Promise<CandleData[]> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${unit}/${interval}/${toDate}/${fromDate}`;

    const response = await this.retryWithBackoff(() =>
      axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      })
    );

    // Transform API response to typed format
    const candles = response.data.data?.candles || [];
    return candles.map((c: any) => ({
      timestamp: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
      oi: c[6]
    }));
  }

  // ============================================
  // Batch Quote Fetching (Concurrent)
  // ============================================

  /**
   * Get batch quotes for multiple instruments using V3 API
   * Processes in parallel batches for speed
   */
  async getBatchQuotes(instrumentKeys: string[], batchSize: number = 100): Promise<Record<string, QuoteData>> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < instrumentKeys.length; i += batchSize) {
      batches.push(instrumentKeys.slice(i, i + batchSize));
    }

    console.log(`📊 Fetching ${instrumentKeys.length} quotes in ${batches.length} parallel batches...`);

    // Process batches concurrently (max 5 at a time to avoid rate limits)
    const results: Record<string, QuoteData> = {};
    const concurrencyLimit = 5;

    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const currentBatches = batches.slice(i, i + concurrencyLimit);

      const batchPromises = currentBatches.map(async (batch) => {
        try {
          const url = `https://api.upstox.com/v3/market-quote/quotes?instrument_key=${batch.map(k => encodeURIComponent(k)).join(',')}`;

          const response = await this.retryWithBackoff(() =>
            axios.get(url, {
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json'
              }
            })
          );

          return response.data.data || {};
        } catch (error: any) {
          console.error('Batch quote error:', error.message);
          return {};
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(result => Object.assign(results, result));
    }

    console.log(`✓ Fetched ${Object.keys(results).length} quotes`);
    return results;
  }

  /**
   * Get batch LTP for multiple instruments using V3 API
   */
  async getBatchLTP(instrumentKeys: string[], batchSize: number = 100): Promise<Record<string, LTPData>> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    const batches: string[][] = [];
    for (let i = 0; i < instrumentKeys.length; i += batchSize) {
      batches.push(instrumentKeys.slice(i, i + batchSize));
    }

    const results: Record<string, LTPData> = {};
    const concurrencyLimit = 5;

    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const currentBatches = batches.slice(i, i + concurrencyLimit);

      const batchPromises = currentBatches.map(async (batch) => {
        try {
          const url = `https://api.upstox.com/v3/market-quote/ltp?instrument_key=${batch.map(k => encodeURIComponent(k)).join(',')}`;

          const response = await this.retryWithBackoff(() =>
            axios.get(url, {
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Accept': 'application/json'
              }
            })
          );

          return response.data.data || {};
        } catch (error: any) {
          console.error('Batch LTP error:', error.message);
          return {};
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(result => Object.assign(results, result));
    }

    return results;
  }

  // ============================================
  // Top Gainers/Losers (Concurrent)
  // ============================================

  async getTopGainers(limit: number = 50): Promise<string[]> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    try {
      const instruments = await this.loadInstruments('NSE');
      const instrumentKeys = Object.values(instruments).slice(0, 500);

      console.log(`📊 Calculating top gainers from ${instrumentKeys.length} stocks (concurrent)...`);

      // Use concurrent batch fetching
      const quotes = await this.getBatchQuotes(instrumentKeys);

      const stockChanges = Object.entries(quotes)
        .map(([key, data]) => {
          const symbol = key.split('|')[1] || key.split(':')[1];
          const ltp = data.ltp;
          const prevClose = data.ohlc?.close;

          if (!prevClose || prevClose === 0) return null;

          const change = ((ltp - prevClose) / prevClose) * 100;
          return { symbol, change, ltp, prevClose };
        })
        .filter(item => item !== null && item.change > 0)
        .sort((a, b) => (b?.change || 0) - (a?.change || 0))
        .slice(0, limit)
        .map(item => item!.symbol);

      console.log(`✓ Found ${stockChanges.length} top gainers`);
      return stockChanges;
    } catch (error: any) {
      console.error('Failed to fetch top gainers:', error.message);
      return this.getFallbackNifty50();
    }
  }

  async getTopLosers(limit: number = 50): Promise<string[]> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    try {
      const instruments = await this.loadInstruments('NSE');
      const instrumentKeys = Object.values(instruments).slice(0, 500);

      console.log(`📊 Calculating top losers from ${instrumentKeys.length} stocks (concurrent)...`);

      const quotes = await this.getBatchQuotes(instrumentKeys);

      const stockChanges = Object.entries(quotes)
        .map(([key, data]) => {
          const symbol = key.split('|')[1] || key.split(':')[1];
          const ltp = data.ltp;
          const prevClose = data.ohlc?.close;

          if (!prevClose || prevClose === 0) return null;

          const change = ((ltp - prevClose) / prevClose) * 100;
          return { symbol, change, ltp, prevClose };
        })
        .filter(item => item !== null && item.change < 0)
        .sort((a, b) => (a?.change || 0) - (b?.change || 0))
        .slice(0, limit)
        .map(item => item!.symbol);

      console.log(`✓ Found ${stockChanges.length} top losers`);
      return stockChanges;
    } catch (error: any) {
      console.error('Failed to fetch top losers:', error.message);
      return this.getFallbackNifty50();
    }
  }

  private getFallbackNifty50(): string[] {
    console.log('⚠️ Falling back to Nifty 50 stocks');
    return ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'BAJFINANCE', 'LT', 'ASIANPAINT', 'AXISBANK', 'MARUTI', 'TITAN', 'SUNPHARMA', 'ULTRACEMCO', 'NESTLEIND', 'WIPRO', 'HCLTECH', 'TECHM', 'POWERGRID', 'NTPC', 'BAJAJFINSV', 'M&M', 'ONGC', 'TATASTEEL', 'ADANIPORTS', 'JSWSTEEL', 'INDUSINDBK', 'GRASIM', 'TATAMOTORS', 'DIVISLAB', 'DRREDDY', 'BRITANNIA', 'CIPLA', 'EICHERMOT', 'HINDALCO', 'BPCL', 'COALINDIA', 'HEROMOTOCO', 'UPL', 'SHREECEM', 'APOLLOHOSP', 'SBILIFE', 'BAJAJ-AUTO', 'ADANIENT', 'HDFCLIFE', 'TATACONSUM'];
  }

  // ============================================
  // Portfolio APIs
  // ============================================

  async getHoldings(): Promise<HoldingData[]> {
    if (!this.getAccessToken()) {
      throw new Error('No access token available');
    }

    try {
      // Note: Holdings API is still V2 as V3 is not yet available
      const url = 'https://api.upstox.com/v2/portfolio/long-term-holdings';

      const response = await this.retryWithBackoff(() =>
        axios.get(url, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          }
        })
      );

      const holdings = response.data.data || [];
      console.log(`✓ Fetched ${holdings.length} holdings`);
      return holdings;
    } catch (error: any) {
      console.error('Failed to fetch holdings:', error.message);
      return [];
    }
  }

  async getHoldingSymbols(): Promise<string[]> {
    const holdings = await this.getHoldings();
    return holdings.map(h => h.trading_symbol).filter(Boolean);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get full market quote for multiple instruments
   * @deprecated Use getMarketQuote instead (V3)
   */
  async getFullMarketQuote(instrumentKeys: string[]) {
    return this.getMarketQuote(instrumentKeys);
  }
}

export const upstoxApi = new UpstoxAPI();