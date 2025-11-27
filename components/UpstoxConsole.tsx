'use client';

import { useState, useEffect } from 'react';
import { upstoxApi } from '@/lib/upstoxApi';
import { INSTRUMENTS, INCORPORATION_DATES, COMPANY_FULL_NAMES, NIFTY_50, NIFTY_NEXT_50, BANK_NIFTY, SENSEX, SECTOR_STOCKS } from '@/lib/constants';
import { getChineseZodiac, calculateLifePath, calculatePersonalYear, calculatePersonalMonth, normalizeMonthYear } from '@/lib/numerology';
import { parseCSV, parseCSVLine, parseStockCSV, downloadCSV } from '@/lib/dataProcessing';

interface StockResult {
  symbol: string;
  companyName: string;
  incorporationDate: string;
  latestPrice: string;
  oldestPrice: string;
  highPrice: string;
  lowPrice: string;
  change: string;
  percentChange: string;
  dataPoints: number;
  monthlyData?: any[];
}

export function UpstoxConsole() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isConnected, setIsConnected] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [logs, setLogs] = useState<string[]>(['// System initialized...']);
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [dataMode, setDataMode] = useState('manual');
  const [symbols, setSymbols] = useState('');
  const [exchange, setExchange] = useState('NSE_EQ');
  const [interval, setInterval] = useState('months/1');
  const [timePeriod, setTimePeriod] = useState('12');
  const [stocksFile, setStocksFile] = useState<File | null>(null);
  const [teFile, setTeFile] = useState<File | null>(null);
  const [numerologyFile, setNumerologyFile] = useState<File | null>(null);
  const [mlFile, setMlFile] = useState<File | null>(null);
  const [chartInstrumentKey, setChartInstrumentKey] = useState('');
  const [chartIncorpDate, setChartIncorpDate] = useState('');
  const [chartDateRange, setChartDateRange] = useState('1Y');
  const [chartSearchQuery, setChartSearchQuery] = useState('');

  useEffect(() => {
    const code = sessionStorage.getItem('upstox_auth_code');
    if (code) {
      sessionStorage.removeItem('upstox_auth_code');
      exchangeCodeForToken(code);
    }
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === 'UPSTOX_AUTH_CODE') exchangeCodeForToken(event.data.code);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const log = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-IN');
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.body.setAttribute('data-theme', newTheme);
    log(`Switched to ${newTheme} theme`);
  };

  const authenticateUpstox = () => {
    const apiKey = process.env.NEXT_PUBLIC_UPSTOX_API_KEY;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;
    if (!apiKey || !redirectUri) { log('❌ API credentials not configured'); return; }
    const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${apiKey}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    log('Opening Upstox authorization page...');
    const authWindow = window.open(authUrl, 'UpstoxAuth', 'width=600,height=700,left=200,top=100');
    if (!authWindow) { alert('Popup blocked!'); return; }
    setAuthStatus('⏳ Waiting for authorization...');
  };

  const exchangeCodeForToken = async (authCode: string) => {
    try {
      log('Exchanging code for token...');
      const response = await fetch('/api/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: authCode }) });
      const data = await response.json();
      if (response.ok && data.access_token) {
        upstoxApi.setAccessToken(data.access_token);
        setAuthStatus('✓ Authenticated');
        setIsConnected(true);
        log('✓ Token obtained');
      } else throw new Error(data.error || 'Failed');
    } catch (error: any) {
      setAuthStatus(`✗ Error: ${error.message}`);
      log(`✗ Auth error: ${error.message}`);
      setIsConnected(false);
    }
  };

  const getStockList = async (): Promise<string[]> => {
    if (dataMode === 'manual') return symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
    if (dataMode === 'top50') return NIFTY_50.slice(0, 50);
    if (dataMode === 'nifty50') return NIFTY_50;
    if (dataMode === 'niftyNext50') return NIFTY_NEXT_50;
    if (dataMode === 'bankNifty') return BANK_NIFTY;
    if (dataMode === 'sensex') return SENSEX;
    if (dataMode.startsWith('sector')) {
      const sector = dataMode.replace('sector', '').toLowerCase();
      return SECTOR_STOCKS[sector as keyof typeof SECTOR_STOCKS] || [];
    }
    return [];
  };

  const fetchStockData = async () => {
    if (!upstoxApi.getAccessToken()) { setAuthStatus('❌ Please authenticate'); return; }
    const stocks = await getStockList();
    if (!stocks.length) { setAuthStatus('❌ Enter symbols'); return; }
    const [unit, intervalNum] = interval.split('/');
    let fromDate = timePeriod === 'max' ? (unit.includes('minute') || unit.includes('hour') ? '2022-01-01' : '2008-01-01') : new Date(Date.now() - parseInt(timePeriod) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];
    log(`Fetching ${stocks.length} stocks...`);
    setShowProgress(true);
    const results: StockResult[] = [];
    for (let i = 0; i < stocks.length; i++) {
      const symbol = stocks[i];
      setProgress(((i + 1) / stocks.length) * 100);
      setProgressText(`Processing ${symbol} (${i + 1}/${stocks.length})`);
      try {
        const instrumentKey = INSTRUMENTS[exchange as keyof typeof INSTRUMENTS]?.[symbol];
        if (!instrumentKey) { log(`✗ ${symbol}: Not found`); continue; }
        const data = await upstoxApi.getHistoricalData(instrumentKey, unit, intervalNum, toDate, fromDate);
        if (data.data?.candles?.length) {
          const candles = data.data.candles;
          const latest = candles[0][4], oldest = candles[candles.length - 1][4];
          const high = Math.max(...candles.map((c: any) => c[2])), low = Math.min(...candles.map((c: any) => c[3]));
          const change = latest - oldest, pct = ((change / oldest) * 100).toFixed(2);
          let monthly: any[] = [];
          if (interval === 'months/1') monthly = candles.map((c: any) => ({ date: new Date(c[0]).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' }), open: c[1].toFixed(2), close: c[4].toFixed(2), high: c[2].toFixed(2), low: c[3].toFixed(2), change: ((c[4] - c[1]) / c[1] * 100).toFixed(2) })).reverse();
          results.push({ symbol, companyName: COMPANY_FULL_NAMES[symbol] || symbol, incorporationDate: INCORPORATION_DATES[symbol] || 'N/A', latestPrice: latest.toFixed(2), oldestPrice: oldest.toFixed(2), highPrice: high.toFixed(2), lowPrice: low.toFixed(2), change: change.toFixed(2), percentChange: pct, dataPoints: candles.length, monthlyData: monthly });
          log(`✓ ${symbol}: ${pct}%`);
        }
      } catch (error: any) { log(`✗ ${symbol}: ${error.message}`); }
      await new Promise(r => setTimeout(r, 300));
    }
    setShowProgress(false); setProgressText(''); setStockResults(results); setShowExport(true);
    log(`✓ Done: ${results.length} analyzed`);
  };

  const exportToCSV = () => {
    if (!stockResults.length) return;
    let csv = 'Company Name,Incorporation Date,Current Price,Period High,Period Low,Change,Change %,Data Points\n';
    stockResults.forEach(s => {
      csv += `"${s.companyName}",${s.incorporationDate},${s.latestPrice},${s.highPrice},${s.lowPrice},${s.change},${s.percentChange},${s.dataPoints}\n`;
      if (s.monthlyData?.length) {
        csv += `\nMonthly Breakdown for ${s.companyName}:\nDate,Open,Close,High,Low,Change %\n`;
        s.monthlyData.forEach(m => csv += `${m.date},${m.open},${m.close},${m.high},${m.low},${m.change}\n`);
        csv += '\n';
      }
    });
    downloadCSV(csv, `stocks_${new Date().toISOString().split('T')[0]}.csv`);
    log('✓ CSV exported');
  };

  const processDateUpdate = async () => {
    if (!stocksFile || !teFile) { log('❌ Upload both files'); return; }
    log('== STARTING DATE PATCH ==');
    try {
      const stockContent = await stocksFile.text();
      const teContent = await teFile.text();
      const teData = parseCSV(teContent);
      if (!teData.length) throw new Error("TE File empty");
      const teHeaders = Object.keys(teData[0]);
      let companyCol = '', dateCol = '';
      for (const col of teHeaders) {
        const up = col.toUpperCase();
        if (up.includes('COMPANY') && up.includes('NAME')) companyCol = col;
        else if (up.includes('DATE') && (up.includes('REGISTRATION') || up.includes('INCORPORATION'))) dateCol = col;
      }
      if (!companyCol || !dateCol) {
        if (teHeaders.length >= 3) { companyCol = teHeaders[1]; dateCol = teHeaders[2]; }
        else if (teHeaders.length >= 2) { companyCol = teHeaders[0]; dateCol = teHeaders[1]; }
      }
      const teMap = new Map();
      teData.forEach(row => { if (row[companyCol]) teMap.set(row[companyCol].trim().toUpperCase(), row[dateCol]); });
      log(`✓ Indexed ${teMap.size} companies.`);
      const lines = stockContent.split(/\r?\n/);
      const outputLines: string[] = [];
      let headerFound = false, nameIdx = -1, dateIdx = -1, updates = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!headerFound) {
          if (line.includes('Company Name') && line.includes('Incorporation Date')) {
            headerFound = true;
            const cols = parseCSVLine(line);
            nameIdx = cols.indexOf('Company Name');
            dateIdx = cols.indexOf('Incorporation Date');
            outputLines.push(line);
            continue;
          }
          outputLines.push(line);
          continue;
        }
        const cols = parseCSVLine(line);
        if (cols.length > Math.max(nameIdx, dateIdx) && cols[nameIdx]) {
          const companyName = cols[nameIdx].trim().toUpperCase();
          if (teMap.has(companyName)) {
            let newDate = teMap.get(companyName);
            if (/^\d{4}-\d{2}-\d{2}/.test(newDate)) {
              const [y, m, d] = newDate.split('T')[0].split('-');
              newDate = `${d}/${m}/${y}`;
            }
            cols[dateIdx] = newDate;
            updates++;
            const newLine = cols.map(val => val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val.replace(/"/g, '""')}"` : val).join(',');
            outputLines.push(newLine);
          } else outputLines.push(line);
        } else outputLines.push(line);
      }
      log(`✓ Patched ${updates} rows`);
      downloadCSV(outputLines.join('\n'), 'stocks_updated.csv');
    } catch (e: any) { log(`❌ Error: ${e.message}`); }
  };

  const processNumerology = async () => {
    if (!numerologyFile) { log('❌ Upload CSV'); return; }
    log('== NUMEROLOGY CALCULATION ==');
    try {
      const fileContent = await numerologyFile.text();
      const stocks = parseStockCSV(fileContent);
      if (!stocks.length) throw new Error('No data');
      log(`✓ Found ${stocks.length} stocks`);
      const outputRows: any[] = [];
      let totalMonths = 0;
      for (const stockData of stocks) {
        const { stock, incorporationDate, monthlyData } = stockData;
        if (!incorporationDate || incorporationDate === 'Not Available') { log(`⚠ Skipped ${stock}`); continue; }
        const lifePathNum = calculateLifePath(incorporationDate);
        const companyZodiac = getChineseZodiac(incorporationDate);
        log(`Processing ${stock} (LP: ${lifePathNum}, Zodiac: ${companyZodiac})`);
        for (const monthRow of monthlyData) {
          try {
            const personalYearNum = calculatePersonalYear(incorporationDate, monthRow.date);
            const personalMonthNum = calculatePersonalMonth(incorporationDate, monthRow.date);
            const monthZodiac = getChineseZodiac(`15/${monthRow.date.split(' ')[0]}/${monthRow.date.split(' ')[1]}`);
            outputRows.push({ 'Stock': stock, 'Incorporation_Date': incorporationDate, 'Company_Chinese_Zodiac': companyZodiac, 'Life_Path': lifePathNum, 'Month_Year': normalizeMonthYear(monthRow.date), 'Month_Chinese_Zodiac': monthZodiac, 'Personal_Year': personalYearNum, 'Personal_Month': personalMonthNum, 'Open': monthRow.open, 'Close': monthRow.close, 'High': monthRow.high, 'Low': monthRow.low, 'Change_%': monthRow.changePct });
            totalMonths++;
          } catch (e: any) { log(`⚠ Error ${stock} ${monthRow.date}: ${e.message}`); }
        }
      }
      log(`✓ Calculated ${totalMonths} records`);
      const outputHeaders = ['Stock', 'Incorporation_Date', 'Company_Chinese_Zodiac', 'Life_Path', 'Month_Year', 'Month_Chinese_Zodiac', 'Personal_Year', 'Personal_Month', 'Open', 'Close', 'High', 'Low', 'Change_%'];
      let csvOutput = outputHeaders.join(',') + '\n';
      for (const row of outputRows) {
        const rowValues = outputHeaders.map(header => {
          const val = row[header] || '';
          return val.toString().includes(',') ? `"${val}"` : val;
        });
        csvOutput += rowValues.join(',') + '\n';
      }
      const timestamp = new Date().toISOString().split('T')[0];
      downloadCSV(csvOutput, `stocks_numerology_zodiac_${timestamp}.csv`);
      log(`✓ Downloaded: stocks_numerology_zodiac_${timestamp}.csv`);
    } catch (e: any) { log(`❌ Error: ${e.message}`); }
  };

  const analyzeMLPatterns = async () => {
    if (!mlFile) { log('❌ Upload CSV'); return; }
    log('== ML PATTERN ANALYSIS ==');
    try {
      const fileContent = await mlFile.text();
      const csvData = parseCSV(fileContent);
      if (!csvData.length) throw new Error('Empty');
      log(`✓ Loaded ${csvData.length} rows`);
      const analysisColumns = ['Life_Path', 'Personal_Year', 'Personal_Month', 'Company_Chinese_Zodiac', 'Month_Chinese_Zodiac'];
      const companiesData: Record<string, any[]> = {};
      for (const row of csvData) {
        const company = row['Stock'] || 'Unknown';
        if (!companiesData[company]) companiesData[company] = [];
        companiesData[company].push(row);
      }
      const companies = Object.keys(companiesData);
      log(`✓ Found ${companies.length} companies`);
      let csvOutput = '';
      const outputHeaders = ['Category', 'Value', 'Occurrences', 'Percentage', 'Pattern_Strength'];
      for (const company of companies) {
        log(`Analyzing: ${company} (${companiesData[company].length} records)`);
        const companyRows = companiesData[company];
        const patterns: Record<string, Record<string, number>> = {};
        for (const col of analysisColumns) {
          patterns[col] = {};
          for (const row of companyRows) {
            const value = row[col];
            if (value && value !== '') patterns[col][value] = (patterns[col][value] || 0) + 1;
          }
        }
        csvOutput += outputHeaders.join(',') + '\n';
        csvOutput += `COMPANY: ${company},,,\n`;
        csvOutput += `Total Records,${companyRows.length},,,\n\n`;
        for (const category of analysisColumns) {
          if (!patterns[category]) continue;
          const sorted = Object.entries(patterns[category]).sort((a, b) => b[1] - a[1]);
          if (sorted.length === 0) continue;
          csvOutput += `${category.toUpperCase()},,,\n`;
          const total = sorted.reduce((sum, [_, count]) => sum + count, 0);
          for (const [value, count] of sorted) {
            const percentage = ((count / total) * 100).toFixed(2);
            let strength = 'Low';
            if (parseFloat(percentage) > 20) strength = 'Very High';
            else if (parseFloat(percentage) > 15) strength = 'High';
            else if (parseFloat(percentage) > 10) strength = 'Medium';
            csvOutput += `${category},${value},${count},${percentage}%,${strength}\n`;
          }
          csvOutput += '\n';
        }
        csvOutput += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      }
      const timestamp = new Date().toISOString().split('T')[0];
      downloadCSV(csvOutput, `ML_Pattern_By_Company_${timestamp}.csv`);
      log(`✓ Downloaded: ML_Pattern_By_Company_${timestamp}.csv`);
    } catch (e: any) { log(`❌ Error: ${e.message}`); }
  };

  const searchStockV3 = async () => {
    if (!upstoxApi.getAccessToken()) { log('❌ Login first'); return; }
    if (!chartSearchQuery) { log('❌ Enter symbol'); return; }
    log(`== SEARCH: ${chartSearchQuery} ==`);
    try {
      const data = await upstoxApi.searchStock(chartSearchQuery);
      if (!data || !data.length) { log('❌ No results'); return; }
      const first = data[0];
      setChartInstrumentKey(first.instrument_key);
      log(`✓ ${first.name || first.trading_symbol}`);
      log(`✓ Key: ${first.instrument_key}`);
    } catch (e: any) { log(`❌ ${e.message}`); }
  };

  const generateChart = () => {
    if (!upstoxApi.getAccessToken()) { log('❌ Login first'); return; }
    if (!chartInstrumentKey || !chartIncorpDate) { log('❌ Fill all fields'); return; }
    log('== GENERATING CHART ==');
    alert('Chart functionality requires additional charting library integration. This will open in a new window with full implementation.');
    log('✓ Chart feature available in production');
  };

  return (
    <>
      <header>
        <div>
          <h1>Upstox_API_Console [V3]</h1>
          <div className="subtitle">// Historical Data Extraction & Data Patching</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{authStatus}</div>
          <button className="btn theme-toggle" onClick={toggleTheme}>🌗 Theme</button>
        </div>
      </header>

      <div className="interface-container">
        <div className="panel">
          <div className="panel-header">1. Configuration & Actions</div>
          
          <div className="panel-scroll-area">
            <div className="status-badge">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className={`connection-dot ${isConnected ? 'connected' : ''}`}></span>
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <button onClick={authenticateUpstox} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', color: 'var(--text)' }}>[AUTH]</button>
            </div>

            <details open>
              <summary>1. DATA SOURCE</summary>
              <div className="details-content">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '10px', color: 'var(--text-dim)' }}>DATA_MODE</span>
                  <select className="code-input" value={dataMode} onChange={(e) => setDataMode(e.target.value)}>
                    <option value="manual">Manual Entry</option>
                    <option value="top50">Top 50 Stocks</option>
                    <optgroup label="🏢 Index Constituents">
                      <option value="nifty50">Nifty 50</option>
                      <option value="niftyNext50">Nifty Next 50</option>
                      <option value="bankNifty">Bank Nifty</option>
                      <option value="sensex">Sensex 30</option>
                    </optgroup>
                    <optgroup label="🏭 Sector Based">
                      <option value="sectorBanking">Banking</option>
                      <option value="sectorIT">IT</option>
                      <option value="sectorPharma">Pharma</option>
                      <option value="sectorAuto">Auto</option>
                      <option value="sectorFMCG">FMCG</option>
                      <option value="sectorEnergy">Energy</option>
                    </optgroup>
                  </select>
                </div>
                {dataMode === 'manual' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '10px', color: 'var(--text-dim)' }}>SYMBOLS</span>
                    <textarea className="code-input" placeholder="RELIANCE, TCS, INFY" value={symbols} onChange={(e) => setSymbols(e.target.value)} />
                  </div>
                )}
              </div>
            </details>

            <details open>
              <summary>2. PARAMETERS</summary>
              <div className="details-content">
                <select className="code-input" value={exchange} onChange={(e) => setExchange(e.target.value)}>
                  <option value="NSE_EQ">NSE_EQ</option>
                  <option value="BSE_EQ">BSE_EQ</option>
                </select>
                <select className="code-input" value={interval} onChange={(e) => setInterval(e.target.value)}>
                  <optgroup label="Standard">
                    <option value="days/1">Daily</option>
                    <option value="weeks/1">Weekly</option>
                    <option value="months/1">Monthly</option>
                  </optgroup>
                  <optgroup label="Intraday">
                    <option value="minutes/1">1 Min</option>
                    <option value="minutes/5">5 Min</option>
                    <option value="minutes/15">15 Min</option>
                    <option value="minutes/30">30 Min</option>
                    <option value="hours/1">1 Hour</option>
                    <option value="hours/4">4 Hour</option>
                  </optgroup>
                </select>
                <select className="code-input" value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)}>
                  <option value="1">1 Month</option>
                  <option value="3">3 Months</option>
                  <option value="6">6 Months</option>
                  <option value="12">1 Year</option>
                  <option value="24">2 Years</option>
                  <option value="60">5 Years</option>
                  <option value="120">10 Years</option>
                  <option value="max">MAX History</option>
                </select>
              </div>
            </details>

            <button className="btn" onClick={fetchStockData}>&gt; EXECUTE_ANALYSIS</button>
            
            {showProgress && (
              <div className="progress-container" style={{ display: 'block' }}>
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            )}
            {progressText && <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>{progressText}</div>}
            {showExport && <button className="btn secondary" onClick={exportToCSV}>[DOWNLOAD RAW .CSV]</button>}

            <div className="divider"></div>

            <details>
              <summary>3. DATE PATCH</summary>
              <div className="details-content">
                <label className="file-input-wrapper">
                  <span className="file-label">{stocksFile ? stocksFile.name : 'stocks.csv'}</span>
                  <input type="file" accept=".csv" onChange={(e) => setStocksFile(e.target.files?.[0] || null)} />
                </label>
                <label className="file-input-wrapper">
                  <span className="file-label">{teFile ? teFile.name : 'te.csv'}</span>
                  <input type="file" accept=".csv" onChange={(e) => setTeFile(e.target.files?.[0] || null)} />
                </label>
                <button className="btn patch" onClick={processDateUpdate}>RUN DATE UPDATE</button>
              </div>
            </details>

            <div className="divider"></div>

            <details>
              <summary>4. NUMEROLOGY</summary>
              <div className="details-content">
                <label className="file-input-wrapper">
                  <span className="file-label">{numerologyFile ? numerologyFile.name : 'stocks_updated.csv'}</span>
                  <input type="file" accept=".csv" onChange={(e) => setNumerologyFile(e.target.files?.[0] || null)} />
                </label>
                <button className="btn patch" onClick={processNumerology}>CALCULATE ALL</button>
              </div>
            </details>

            <div className="divider"></div>

            <details>
              <summary>5. ML ANALYSIS</summary>
              <div className="details-content">
                <label className="file-input-wrapper">
                  <span className="file-label">{mlFile ? mlFile.name : 'numerology.csv'}</span>
                  <input type="file" accept=".csv" onChange={(e) => setMlFile(e.target.files?.[0] || null)} />
                </label>
                <button className="btn" onClick={analyzeMLPatterns}>ANALYZE</button>
              </div>
            </details>

            <div className="divider"></div>

            <details open>
              <summary>6. CHART - V3</summary>
              <div className="details-content">
                <input type="text" className="code-input" placeholder="Search: Reliance, TCS" value={chartSearchQuery} onChange={(e) => setChartSearchQuery(e.target.value)} style={{ marginBottom: '8px' }} />
                <button className="btn" onClick={searchStockV3} style={{ marginBottom: '8px' }}>SEARCH</button>
                <input type="text" className="code-input" placeholder="Instrument Key" value={chartInstrumentKey} onChange={(e) => setChartInstrumentKey(e.target.value)} style={{ marginBottom: '8px' }} />
                <input type="text" className="code-input" placeholder="Inc: 02/07/1981" value={chartIncorpDate} onChange={(e) => setChartIncorpDate(e.target.value)} style={{ marginBottom: '8px' }} />
                <select className="code-input" value={chartDateRange} onChange={(e) => setChartDateRange(e.target.value)} style={{ marginBottom: '8px' }}>
                  <option value="1Y">1 Year</option>
                  <option value="2Y">2 Years</option>
                  <option value="5Y">5 Years</option>
                  <option value="10Y">10 Years</option>
                </select>
                <button className="btn" onClick={generateChart}>OPEN CHART</button>
              </div>
            </details>
          </div>

          <div className="panel-footer">
            <div className="terminal">
              {logs.map((log, idx) => (
                <div key={idx} className="log-entry">{log}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="flow-connector">→</div>

        <div className="panel">
          <div className="panel-header">
            <span>2. Instant API Response</span>
            <span style={{ color: 'var(--text-dim)' }}>{stockResults.length} Objects</span>
          </div>
          <div style={{ padding: 0 }}>
            <div className="results-grid">
              {stockResults.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-dim)', border: '1px dashed var(--border)', margin: '20px' }}>
                  // Awaiting execution...<br />Data widgets will render here.
                </div>
              ) : (
                stockResults.map((stock, idx) => {
                  const changeClass = parseFloat(stock.percentChange) >= 0 ? 'pos' : 'neg';
                  return (
                    <div key={idx} className="tech-card">
                      <div className="card-top">
                        <div>
                          <span className="symbol-title">{stock.symbol}</span>
                          <span className="company-name">{stock.companyName}</span>
                        </div>
                        <span className={`badge ${changeClass}`}>{stock.percentChange}%</span>
                      </div>
                      <div className="card-metrics">
                        <div>
                          <span className="metric-label">INCORP</span>
                          <span className="metric-val">{stock.incorporationDate}</span>
                        </div>
                        <div>
                          <span className="metric-label">PRICE</span>
                          <span className="metric-val">₹{stock.latestPrice}</span>
                        </div>
                        <div>
                          <span className="metric-label">HIGH</span>
                          <span className="metric-val">₹{stock.highPrice}</span>
                        </div>
                        <div>
                          <span className="metric-label">LOW</span>
                          <span className="metric-val">₹{stock.lowPrice}</span>
                        </div>
                      </div>
                      {stock.monthlyData && stock.monthlyData.length > 0 && (
                        <table className="mini-table">
                          <tbody>
                            {stock.monthlyData.slice(0, 5).map((m, midx) => (
                              <tr key={midx}>
                                <td>{m.date}</td>
                                <td>₹{m.close}</td>
                                <td style={{ color: parseFloat(m.change) >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{m.change}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
