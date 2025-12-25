'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { format } from 'd3-format';
import { timeFormat } from 'd3-time-format';
import {
  discontinuousTimeScaleProviderBuilder,
  Chart,
  ChartCanvas,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  BollingerSeries,
  MACDSeries,
  RSISeries,
  XAxis,
  YAxis,
  CrossHairCursor,
  EdgeIndicator,
  MouseCoordinateX,
  MouseCoordinateY,
  OHLCTooltip,
  MovingAverageTooltip,
  ZoomButtons,
  LabelAnnotation,
  Annotate,
  ema,
  sma,
  bollingerBand,
  macd,
  rsi,
} from 'react-financial-charts';
import { calculatePersonalYear, calculatePersonalMonth } from '@/lib/numerology';

interface StockChartProps {
  instrumentKey: string;
  symbol: string;
  companyName: string;
  incorporationDate: string;
  dateRange: string;
  accessToken: string;
  onClose: () => void;
}

type ChartInterval = 'days' | 'weeks' | 'months';
type DateRangeType = '1Y' | '2Y' | '5Y' | '10Y';

interface IOHLCData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  py?: number;
  pm?: number;
  ema12?: number;
  ema26?: number;
  sma20?: number;
  sma50?: number;
  bb?: { top: number; middle: number; bottom: number };
  macd?: { macd: number; signal: number; divergence: number };
  rsiVal?: number;
  tenkanSen?: number;
  kijunSen?: number;
  senkouSpanA?: number;
  senkouSpanB?: number;
  chikouSpan?: number;
}

// Theme definitions
const themes = {
  dark: {
    background: '#1E1E2E',
    text: '#DDD',
    textMuted: '#888',
    gridLines: '#2B2B43',
    border: '#2B2B43',
    controlBg: '#2B2B43',
    controlBgHover: '#3B3B53',
    tooltipBg: '#2B2B43',
  },
  light: {
    background: '#FFFFFF',
    text: '#333',
    textMuted: '#666',
    gridLines: '#f0f0f0',
    border: '#e0e0e0',
    controlBg: '#f0f0f0',
    controlBgHover: '#e0e0e0',
    tooltipBg: '#f5f5f5',
  },
};

// Color mapping for numerology numbers
const getNumerologyColor = (num: number): string => {
  const colors: Record<number, string> = {
    1: '#FF6B6B', 2: '#4ECDC4', 3: '#FFE66D', 4: '#95E1D3', 5: '#F38181',
    6: '#AA96DA', 7: '#6C5B7B', 8: '#355C7D', 9: '#F67280',
    11: '#C3073F', 22: '#1A1A2E', 28: '#2E4057', 33: '#048A81', 20: '#540D6E',
  };
  return colors[num] || '#888888';
};

// Calculate Ichimoku Cloud
const calculateIchimoku = (data: IOHLCData[], conversionPeriod = 9, basePeriod = 26, spanBPeriod = 52, displacement = 26) => {
  const result = [...data];

  const highestHigh = (arr: IOHLCData[], period: number, endIdx: number) => {
    let max = -Infinity;
    for (let i = Math.max(0, endIdx - period + 1); i <= endIdx; i++) {
      if (arr[i]?.high > max) max = arr[i].high;
    }
    return max;
  };

  const lowestLow = (arr: IOHLCData[], period: number, endIdx: number) => {
    let min = Infinity;
    for (let i = Math.max(0, endIdx - period + 1); i <= endIdx; i++) {
      if (arr[i]?.low < min) min = arr[i].low;
    }
    return min;
  };

  for (let i = 0; i < result.length; i++) {
    if (i >= conversionPeriod - 1) {
      const hh = highestHigh(result, conversionPeriod, i);
      const ll = lowestLow(result, conversionPeriod, i);
      result[i].tenkanSen = (hh + ll) / 2;
    }

    if (i >= basePeriod - 1) {
      const hh = highestHigh(result, basePeriod, i);
      const ll = lowestLow(result, basePeriod, i);
      result[i].kijunSen = (hh + ll) / 2;
    }

    if (result[i].tenkanSen && result[i].kijunSen) {
      const spanAIdx = i + displacement;
      if (spanAIdx < result.length) {
        result[spanAIdx].senkouSpanA = (result[i].tenkanSen! + result[i].kijunSen!) / 2;
      }
    }

    if (i >= spanBPeriod - 1) {
      const hh = highestHigh(result, spanBPeriod, i);
      const ll = lowestLow(result, spanBPeriod, i);
      const spanBIdx = i + displacement;
      if (spanBIdx < result.length) {
        result[spanBIdx].senkouSpanB = (hh + ll) / 2;
      }
    }

    if (i >= displacement) {
      result[i - displacement].chikouSpan = result[i].close;
    }
  }

  return result;
};

export function StockChart({
  instrumentKey, symbol, companyName, incorporationDate, dateRange: initialDateRange, accessToken, onClose
}: StockChartProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartInterval, setChartInterval] = useState<ChartInterval>('days');
  const [dateRange, setDateRange] = useState<DateRangeType>(initialDateRange as DateRangeType || '1Y');
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [showNumerology, setShowNumerology] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showSMA, setShowSMA] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showIchimoku, setShowIchimoku] = useState(false);
  const [chartData, setChartData] = useState<IOHLCData[]>([]);
  const [currentData, setCurrentData] = useState<{ price: number, py: number, pm: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const theme = isDarkTheme ? themes.dark : themes.light;

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth - 30,
        height: window.innerHeight - 180,
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const loadChartData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const toDate = new Date().toISOString().split('T')[0];
      let fromDate: Date;

      switch (dateRange) {
        case '1Y': fromDate = new Date(); fromDate.setFullYear(fromDate.getFullYear() - 1); break;
        case '2Y': fromDate = new Date(); fromDate.setFullYear(fromDate.getFullYear() - 2); break;
        case '5Y': fromDate = new Date(); fromDate.setFullYear(fromDate.getFullYear() - 5); break;
        case '10Y': fromDate = new Date(); fromDate.setFullYear(fromDate.getFullYear() - 10); break;
        default: fromDate = new Date(); fromDate.setFullYear(fromDate.getFullYear() - 1);
      }

      const fromDateStr = fromDate.toISOString().split('T')[0];

      const response = await fetch('/api/historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentKey, interval: chartInterval, intervalNum: '1',
          toDate, fromDate: fromDateStr, accessToken
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch data: ${response.status}`);
      }

      const data = await response.json();

      if (!data.data?.candles || data.data.candles.length === 0) {
        throw new Error('No data available for this period');
      }

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const candles: IOHLCData[] = data.data.candles.reverse().map((c: any) => {
        const candleDate = new Date(c[0]);
        const monthYear = `${monthNames[candleDate.getMonth()]} ${candleDate.getFullYear()}`;

        let py = 0;
        let pm = 0;

        if (incorporationDate && incorporationDate !== 'N/A') {
          try {
            py = calculatePersonalYear(incorporationDate, monthYear);
            pm = calculatePersonalMonth(incorporationDate, monthYear);
          } catch (e) {
            // Ignore numerology calculation errors
          }
        }

        return {
          date: candleDate,
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5] || 0,
          py,
          pm,
        };
      });

      const candlesWithIchimoku = calculateIchimoku(candles);
      setChartData(candlesWithIchimoku);

      if (candles.length > 0) {
        const latest = candles[candles.length - 1];
        setCurrentData({ price: latest.close, py: latest.py || 0, pm: latest.pm || 0 });
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Chart data error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [instrumentKey, chartInterval, dateRange, accessToken, incorporationDate]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // Indicators
  const ema12 = useMemo(() => ema()
    .id(1)
    .options({ windowSize: 12 })
    .merge((d: any, c: any) => { d.ema12 = c; })
    .accessor((d: any) => d.ema12), []);

  const ema26 = useMemo(() => ema()
    .id(2)
    .options({ windowSize: 26 })
    .merge((d: any, c: any) => { d.ema26 = c; })
    .accessor((d: any) => d.ema26), []);

  const sma20 = useMemo(() => sma()
    .id(3)
    .options({ windowSize: 20 })
    .merge((d: any, c: any) => { d.sma20 = c; })
    .accessor((d: any) => d.sma20), []);

  const sma50 = useMemo(() => sma()
    .id(4)
    .options({ windowSize: 50 })
    .merge((d: any, c: any) => { d.sma50 = c; })
    .accessor((d: any) => d.sma50), []);

  const bb = useMemo(() => bollingerBand()
    .merge((d: any, c: any) => { d.bb = c; })
    .accessor((d: any) => d.bb), []);

  const macdCalc = useMemo(() => macd()
    .options({ fast: 12, slow: 26, signal: 9 })
    .merge((d: any, c: any) => { d.macd = c; })
    .accessor((d: any) => d.macd), []);

  const rsiCalc = useMemo(() => rsi()
    .options({ windowSize: 14 })
    .merge((d: any, c: any) => { d.rsiVal = c; })
    .accessor((d: any) => d.rsiVal), []);

  // Calculate all indicators
  const calculatedData = useMemo(() => {
    if (chartData.length === 0) return [];
    let data = chartData;
    data = ema12(data);
    data = ema26(data);
    data = sma20(data);
    data = sma50(data);
    data = bb(data);
    data = macdCalc(data);
    data = rsiCalc(data);
    return data;
  }, [chartData, ema12, ema26, sma20, sma50, bb, macdCalc, rsiCalc]);

  // Chart configuration
  const margin = { left: 0, right: 70, top: 10, bottom: 30 };
  const pricesDisplayFormat = format('.2f');
  const volumeFormat = format('.4s');
  const dateDisplayFormat = timeFormat('%d %b %Y');
  const xScaleProvider = discontinuousTimeScaleProviderBuilder().inputDateAccessor((d: IOHLCData) => d.date);

  const { data, xScale, xAccessor, displayXAccessor } = xScaleProvider(calculatedData);

  const max = data.length > 0 ? xAccessor(data[data.length - 1]) : 0;
  const min = data.length > 0 ? xAccessor(data[Math.max(0, data.length - 100)]) : 0;
  const xExtents = [min, max + 5];

  // Calculate chart heights based on which indicators are visible
  const gridHeight = dimensions.height - margin.top - margin.bottom;
  const macdHeight = showMACD ? 100 : 0;
  const rsiHeight = showRSI ? 80 : 0;
  const volumeChartHeight = 60;
  const candleChartHeight = gridHeight - volumeChartHeight - macdHeight - rsiHeight;

  const volumeChartOrigin = (_: number, h: number) => [0, candleChartHeight];
  const macdChartOrigin = (_: number, h: number) => [0, candleChartHeight + volumeChartHeight];
  const rsiChartOrigin = (_: number, h: number) => [0, candleChartHeight + volumeChartHeight + macdHeight];

  // Accessor functions
  const candleChartExtents = (d: IOHLCData) => {
    const values = [d.high, d.low];
    if (showBollinger && d.bb) {
      values.push(d.bb.top, d.bb.bottom);
    }
    return values;
  };
  const volumeExtents = (d: IOHLCData) => d.volume;
  const volumeColor = (d: IOHLCData) => (d.close > d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)');
  const openCloseColor = (d: IOHLCData) => (d.close > d.open ? '#26a69a' : '#ef5350');

  const markerFrequency = chartInterval === 'days' ? 20 : chartInterval === 'weeks' ? 4 : 1;

  const numerologyAnnotationProps = {
    fontFamily: 'Arial',
    fontSize: 10,
    fill: (d: IOHLCData) => getNumerologyColor(d.py || 0),
    text: (d: IOHLCData) => `${d.py}/${d.pm}`,
    y: ({ yScale, datum }: { yScale: any, datum: IOHLCData }) => yScale(datum.high) - 15,
  };

  const ToggleButton = ({ active, onClick, children, color }: { active: boolean, onClick: () => void, children: React.ReactNode, color?: string }) => (
    <button onClick={onClick} style={{
      padding: '5px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px',
      background: active ? (color || '#4CAF50') : theme.controlBg,
      color: active ? 'white' : theme.text,
      display: 'flex', alignItems: 'center', gap: '4px',
      transition: 'all 0.2s'
    }}>
      {children}
      <span style={{ fontSize: '9px' }}>{active ? '✓' : '○'}</span>
    </button>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: theme.background, zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '15px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 style={{ margin: 0, color: theme.text, fontSize: '20px' }}>📊 {symbol}</h2>
          <span style={{ color: theme.textMuted, fontSize: '14px' }}>{companyName}</span>
          {currentData && (
            <span style={{ color: '#26a69a', fontSize: '18px', fontWeight: 'bold' }}>
              ₹{currentData.price.toFixed(2)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Theme Toggle */}
          <button onClick={() => setIsDarkTheme(!isDarkTheme)} style={{
            padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
            background: theme.controlBg, color: theme.text
          }}>
            {isDarkTheme ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button onClick={onClose} style={{
            background: '#ef5350', border: 'none', color: 'white', padding: '8px 16px',
            borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold'
          }}>✕ Close</button>
        </div>
      </div>

      {/* Controls Row 1: Interval & Date Range */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Interval buttons */}
        <div style={{ display: 'flex', gap: '2px', background: theme.controlBg, borderRadius: '4px', padding: '2px' }}>
          {(['days', 'weeks', 'months'] as ChartInterval[]).map((int) => (
            <button key={int} onClick={() => setChartInterval(int)} style={{
              padding: '5px 10px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
              background: chartInterval === int ? '#4CAF50' : 'transparent',
              color: chartInterval === int ? 'white' : theme.text,
              fontWeight: chartInterval === int ? 'bold' : 'normal'
            }}>{int === 'days' ? '1D' : int === 'weeks' ? '1W' : '1M'}</button>
          ))}
        </div>

        {/* Date Range buttons */}
        <div style={{ display: 'flex', gap: '2px', background: theme.controlBg, borderRadius: '4px', padding: '2px' }}>
          {(['1Y', '2Y', '5Y', '10Y'] as DateRangeType[]).map((range) => (
            <button key={range} onClick={() => setDateRange(range)} style={{
              padding: '5px 10px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px',
              background: dateRange === range ? '#2196F3' : 'transparent',
              color: dateRange === range ? 'white' : theme.text,
              fontWeight: dateRange === range ? 'bold' : 'normal'
            }}>{range}</button>
          ))}
        </div>

        {/* PY/PM display */}
        {showNumerology && currentData && currentData.py !== 0 && incorporationDate !== 'N/A' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: theme.controlBg, padding: '5px 10px', borderRadius: '4px', fontSize: '11px' }}>
            <span style={{ color: theme.textMuted }}>Inc: {incorporationDate}</span>
            <span style={{ background: getNumerologyColor(currentData.py), color: '#fff', padding: '2px 6px', borderRadius: '8px', fontWeight: 'bold' }}>PY:{currentData.py}</span>
            <span style={{ background: getNumerologyColor(currentData.pm), color: '#fff', padding: '2px 6px', borderRadius: '8px', fontWeight: 'bold' }}>PM:{currentData.pm}</span>
          </div>
        )}
      </div>

      {/* Controls Row 2: Indicators */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: theme.textMuted, fontSize: '11px', marginRight: '4px' }}>Indicators:</span>
        <ToggleButton active={showEMA} onClick={() => setShowEMA(!showEMA)} color="#2196F3">EMA 12/26</ToggleButton>
        <ToggleButton active={showSMA} onClick={() => setShowSMA(!showSMA)} color="#9C27B0">SMA 20/50</ToggleButton>
        <ToggleButton active={showBollinger} onClick={() => setShowBollinger(!showBollinger)} color="#FF9800">Bollinger</ToggleButton>
        <ToggleButton active={showMACD} onClick={() => setShowMACD(!showMACD)} color="#E91E63">MACD</ToggleButton>
        <ToggleButton active={showRSI} onClick={() => setShowRSI(!showRSI)} color="#00BCD4">RSI</ToggleButton>
        <ToggleButton active={showIchimoku} onClick={() => setShowIchimoku(!showIchimoku)} color="#FF5722">Ichimoku</ToggleButton>
        <ToggleButton active={showNumerology} onClick={() => setShowNumerology(!showNumerology)} color="#673AB7">PY/PM</ToggleButton>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto', fontSize: '10px', color: theme.textMuted }}>
          {showEMA && <><span style={{ color: '#2196F3' }}>●EMA12</span><span style={{ color: '#FF5722' }}>●EMA26</span></>}
          {showSMA && <><span style={{ color: '#9C27B0' }}>●SMA20</span><span style={{ color: '#4CAF50' }}>●SMA50</span></>}
          {showBollinger && <span style={{ color: '#FF9800' }}>●BB</span>}
          {showIchimoku && <><span style={{ color: '#0D47A1' }}>●Tenkan</span><span style={{ color: '#B71C1C' }}>●Kijun</span></>}
        </div>
      </div>

      {/* Chart Container */}
      <div style={{ flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: theme.background, color: theme.text, fontSize: '16px', zIndex: 10
          }}>⏳ Loading {chartInterval} chart for {dateRange}...</div>
        )}
        {error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: theme.background, color: '#ef5350', fontSize: '14px', zIndex: 10, gap: '8px'
          }}>
            <div>❌ {error}</div>
            <button onClick={loadChartData} style={{
              padding: '8px 16px', background: '#4CAF50', border: 'none', borderRadius: '4px',
              color: 'white', cursor: 'pointer', fontSize: '12px'
            }}>Retry</button>
          </div>
        )}

        {!loading && !error && data.length > 0 && (
          <ChartCanvas
            height={dimensions.height}
            ratio={typeof window !== 'undefined' ? window.devicePixelRatio : 1}
            width={dimensions.width}
            margin={margin}
            data={data}
            displayXAccessor={displayXAccessor}
            seriesName="Stock"
            xScale={xScale}
            xAccessor={xAccessor}
            xExtents={xExtents}
          >
            {/* Main Candlestick Chart */}
            <Chart id={1} height={candleChartHeight} yExtents={candleChartExtents}>
              <XAxis
                showGridLines
                gridLinesStrokeStyle={theme.gridLines}
                strokeStyle={theme.border}
                tickLabelFill={theme.textMuted}
              />
              <YAxis
                axisAt="right"
                orient="right"
                showGridLines
                gridLinesStrokeStyle={theme.gridLines}
                strokeStyle={theme.border}
                tickLabelFill={theme.textMuted}
                tickFormat={pricesDisplayFormat}
              />

              {/* Bollinger Bands */}
              {showBollinger && (
                <BollingerSeries
                  yAccessor={(d: any) => d.bb}
                />
              )}

              {/* Ichimoku Lines */}
              {showIchimoku && (
                <>
                  <LineSeries yAccessor={(d: IOHLCData) => d.tenkanSen} strokeStyle="#0D47A1" strokeWidth={1} />
                  <LineSeries yAccessor={(d: IOHLCData) => d.kijunSen} strokeStyle="#B71C1C" strokeWidth={1} />
                  <LineSeries yAccessor={(d: IOHLCData) => d.senkouSpanA} strokeStyle="rgba(76, 175, 80, 0.6)" strokeWidth={1} />
                  <LineSeries yAccessor={(d: IOHLCData) => d.senkouSpanB} strokeStyle="rgba(244, 67, 54, 0.6)" strokeWidth={1} />
                  <LineSeries yAccessor={(d: IOHLCData) => d.chikouSpan} strokeStyle="#7B1FA2" strokeWidth={1} />
                </>
              )}

              {/* Candlesticks */}
              <CandlestickSeries
                fill={(d: IOHLCData) => d.close > d.open ? '#26a69a' : '#ef5350'}
                wickStroke={(d: IOHLCData) => d.close > d.open ? '#26a69a' : '#ef5350'}
              />

              {/* EMA Lines */}
              {showEMA && (
                <>
                  <LineSeries yAccessor={ema12.accessor()} strokeStyle="#2196F3" strokeWidth={1.5} />
                  <LineSeries yAccessor={ema26.accessor()} strokeStyle="#FF5722" strokeWidth={1.5} />
                </>
              )}

              {/* SMA Lines */}
              {showSMA && (
                <>
                  <LineSeries yAccessor={sma20.accessor()} strokeStyle="#9C27B0" strokeWidth={1.5} />
                  <LineSeries yAccessor={sma50.accessor()} strokeStyle="#4CAF50" strokeWidth={1.5} />
                </>
              )}

              {/* Numerology Markers */}
              {showNumerology && incorporationDate !== 'N/A' && (
                <Annotate
                  with={LabelAnnotation}
                  when={(d: IOHLCData, idx: number) => idx % markerFrequency === 0 && d.py !== 0}
                  usingProps={numerologyAnnotationProps}
                />
              )}

              {/* Mouse Coordinates */}
              <MouseCoordinateX
                at="bottom"
                orient="bottom"
                displayFormat={dateDisplayFormat}
                fill={theme.tooltipBg}
                textFill={theme.text}
              />
              <MouseCoordinateY
                at="right"
                orient="right"
                displayFormat={pricesDisplayFormat}
                rectWidth={margin.right}
                fill={theme.tooltipBg}
                textFill={theme.text}
              />

              <EdgeIndicator
                itemType="last"
                orient="right"
                edgeAt="right"
                yAccessor={(d: IOHLCData) => d.close}
                fill={openCloseColor}
                lineStroke={openCloseColor}
                displayFormat={pricesDisplayFormat}
                rectWidth={margin.right}
              />

              <OHLCTooltip origin={[8, 16]} textFill={theme.text} labelFill={theme.textMuted} />

              {showEMA && (
                <MovingAverageTooltip
                  origin={[8, 36]}
                  options={[
                    { yAccessor: ema12.accessor(), type: 'EMA', stroke: '#2196F3', windowSize: 12 },
                    { yAccessor: ema26.accessor(), type: 'EMA', stroke: '#FF5722', windowSize: 26 },
                  ]}
                />
              )}

              {showSMA && (
                <MovingAverageTooltip
                  origin={[8, showEMA ? 56 : 36]}
                  options={[
                    { yAccessor: sma20.accessor(), type: 'SMA', stroke: '#9C27B0', windowSize: 20 },
                    { yAccessor: sma50.accessor(), type: 'SMA', stroke: '#4CAF50', windowSize: 50 },
                  ]}
                />
              )}



              <ZoomButtons />
            </Chart>

            {/* Volume Chart */}
            <Chart id={2} height={volumeChartHeight} origin={volumeChartOrigin} yExtents={volumeExtents}>
              <BarSeries fillStyle={volumeColor} yAccessor={(d: IOHLCData) => d.volume} />
              <YAxis axisAt="right" orient="right" ticks={2} tickFormat={volumeFormat} strokeStyle={theme.border} tickLabelFill={theme.textMuted} />
            </Chart>

            {/* MACD Chart */}
            {showMACD && (
              <Chart id={3} height={macdHeight} origin={macdChartOrigin} yExtents={macdCalc.accessor()}>
                <XAxis showGridLines gridLinesStrokeStyle={theme.gridLines} strokeStyle={theme.border} tickLabelFill={theme.textMuted} />
                <YAxis axisAt="right" orient="right" ticks={3} strokeStyle={theme.border} tickLabelFill={theme.textMuted} />
                <MACDSeries yAccessor={macdCalc.accessor()} />
              </Chart>
            )}

            {/* RSI Chart */}
            {showRSI && (
              <Chart id={4} height={rsiHeight} origin={rsiChartOrigin} yExtents={[0, 100]}>
                <XAxis showGridLines gridLinesStrokeStyle={theme.gridLines} strokeStyle={theme.border} tickLabelFill={theme.textMuted} />
                <YAxis axisAt="right" orient="right" ticks={3} tickValues={[30, 50, 70]} strokeStyle={theme.border} tickLabelFill={theme.textMuted} />
                <RSISeries yAccessor={rsiCalc.accessor()} />
              </Chart>
            )}

            <CrossHairCursor strokeStyle={theme.textMuted} />
          </ChartCanvas>
        )}
      </div>

      {/* Footer */}
      <div style={{ color: theme.textMuted, fontSize: '10px', textAlign: 'center', marginTop: '6px' }}>
        💡 Scroll to zoom • Drag to pan • Hover shows date & price • Click indicators to toggle
      </div>
    </div>
  );
}