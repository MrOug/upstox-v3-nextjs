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
  XAxis,
  YAxis,
  CrossHairCursor,
  EdgeIndicator,
  MouseCoordinateY,
  OHLCTooltip,
  MovingAverageTooltip,
  ZoomButtons,
  LabelAnnotation,
  Annotate,
  ema,
  sma,
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
  sma9?: number;
  tenkanSen?: number;
  kijunSen?: number;
  senkouSpanA?: number;
  senkouSpanB?: number;
  chikouSpan?: number;
}

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
    // Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
    if (i >= conversionPeriod - 1) {
      const hh = highestHigh(result, conversionPeriod, i);
      const ll = lowestLow(result, conversionPeriod, i);
      result[i].tenkanSen = (hh + ll) / 2;
    }

    // Kijun-sen (Base Line): (26-period high + 26-period low) / 2
    if (i >= basePeriod - 1) {
      const hh = highestHigh(result, basePeriod, i);
      const ll = lowestLow(result, basePeriod, i);
      result[i].kijunSen = (hh + ll) / 2;
    }

    // Senkou Span A (Leading Span A): (Tenkan-sen + Kijun-sen) / 2, plotted 26 periods ahead
    if (result[i].tenkanSen && result[i].kijunSen) {
      const spanAIdx = i + displacement;
      if (spanAIdx < result.length) {
        result[spanAIdx].senkouSpanA = (result[i].tenkanSen! + result[i].kijunSen!) / 2;
      }
    }

    // Senkou Span B (Leading Span B): (52-period high + 52-period low) / 2, plotted 26 periods ahead
    if (i >= spanBPeriod - 1) {
      const hh = highestHigh(result, spanBPeriod, i);
      const ll = lowestLow(result, spanBPeriod, i);
      const spanBIdx = i + displacement;
      if (spanBIdx < result.length) {
        result[spanBIdx].senkouSpanB = (hh + ll) / 2;
      }
    }

    // Chikou Span (Lagging Span): Current closing price plotted 26 periods back
    if (i >= displacement) {
      result[i - displacement].chikouSpan = result[i].close;
    }
  }

  return result;
};

export function StockChart({
  instrumentKey, symbol, companyName, incorporationDate, dateRange, accessToken, onClose
}: StockChartProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartInterval, setChartInterval] = useState<ChartInterval>('days');
  const [showNumerology, setShowNumerology] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showIchimoku, setShowIchimoku] = useState(true);
  const [chartData, setChartData] = useState<IOHLCData[]>([]);
  const [currentData, setCurrentData] = useState<{ price: number, py: number, pm: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth - 30,
        height: window.innerHeight - 150,
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

      // Transform data for react-financial-charts (oldest first)
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

      // Calculate Ichimoku Cloud
      const candlesWithIchimoku = calculateIchimoku(candles);

      setChartData(candlesWithIchimoku);

      // Set current data (latest)
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

  // Load data when interval changes
  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // EMA Indicators
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

  const sma9 = useMemo(() => sma()
    .id(3)
    .options({ windowSize: 9 })
    .merge((d: any, c: any) => { d.sma9 = c; })
    .accessor((d: any) => d.sma9), []);

  // Calculate EMAs on data
  const calculatedData = useMemo(() => {
    if (chartData.length === 0) return [];
    return sma9(ema26(ema12(chartData)));
  }, [chartData, ema12, ema26, sma9]);

  // Chart configuration
  const margin = { left: 0, right: 70, top: 10, bottom: 30 };
  const pricesDisplayFormat = format('.2f');
  const volumeFormat = format('.4s');
  const xScaleProvider = discontinuousTimeScaleProviderBuilder().inputDateAccessor((d: IOHLCData) => d.date);

  // Prepare chart data
  const { data, xScale, xAccessor, displayXAccessor } = xScaleProvider(calculatedData);

  const max = data.length > 0 ? xAccessor(data[data.length - 1]) : 0;
  const min = data.length > 0 ? xAccessor(data[Math.max(0, data.length - 100)]) : 0;
  const xExtents = [min, max + 5];

  const gridHeight = dimensions.height - margin.top - margin.bottom;
  const volumeChartHeight = gridHeight * 0.15;
  const candleChartHeight = gridHeight * 0.85;
  const volumeChartOrigin = (_: number, h: number) => [0, h - volumeChartHeight];

  // Accessor functions
  const candleChartExtents = (d: IOHLCData) => {
    const values = [d.high, d.low];
    if (d.senkouSpanA) values.push(d.senkouSpanA);
    if (d.senkouSpanB) values.push(d.senkouSpanB);
    return values;
  };
  const volumeExtents = (d: IOHLCData) => d.volume;
  const volumeColor = (d: IOHLCData) => (d.close > d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)');
  const openCloseColor = (d: IOHLCData) => (d.close > d.open ? '#26a69a' : '#ef5350');

  // Numerology annotation props
  const markerFrequency = chartInterval === 'days' ? 20 : chartInterval === 'weeks' ? 4 : 1;

  const numerologyAnnotationProps = {
    fontFamily: 'Arial',
    fontSize: 10,
    fill: (d: IOHLCData) => getNumerologyColor(d.py || 0),
    text: (d: IOHLCData) => `${d.py}/${d.pm}`,
    y: ({ yScale, datum }: { yScale: any, datum: IOHLCData }) => yScale(datum.high) - 15,
    tooltip: (d: IOHLCData) => `PY: ${d.py}, PM: ${d.pm}`,
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#FFFFFF', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '15px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 style={{ margin: 0, color: '#333', fontSize: '20px' }}>📊 {symbol}</h2>
          <span style={{ color: '#666', fontSize: '14px' }}>{companyName}</span>
          {currentData && (
            <span style={{ color: '#26a69a', fontSize: '18px', fontWeight: 'bold' }}>
              ₹{currentData.price.toFixed(2)}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{
          background: '#ef5350', border: 'none', color: 'white', padding: '8px 16px',
          borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold'
        }}>✕ Close</button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Interval buttons */}
        <div style={{ display: 'flex', gap: '4px', background: '#f0f0f0', borderRadius: '4px', padding: '2px' }}>
          {(['days', 'weeks', 'months'] as ChartInterval[]).map((int) => (
            <button key={int} onClick={() => setChartInterval(int)} style={{
              padding: '6px 12px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px',
              background: chartInterval === int ? '#4CAF50' : 'transparent', color: chartInterval === int ? 'white' : '#333', fontWeight: chartInterval === int ? 'bold' : 'normal'
            }}>{int === 'days' ? '1D' : int === 'weeks' ? '1W' : '1M'}</button>
          ))}
        </div>

        {/* EMA toggle */}
        <button onClick={() => setShowEMA(!showEMA)} style={{
          padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
          background: showEMA ? '#2196F3' : '#e0e0e0', color: showEMA ? 'white' : '#333', display: 'flex', alignItems: 'center', gap: '5px'
        }}>
          <span>EMA</span>
          <span style={{ fontSize: '10px' }}>{showEMA ? '✓' : '○'}</span>
        </button>

        {/* Ichimoku toggle */}
        <button onClick={() => setShowIchimoku(!showIchimoku)} style={{
          padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
          background: showIchimoku ? '#FF9800' : '#e0e0e0', color: showIchimoku ? 'white' : '#333', display: 'flex', alignItems: 'center', gap: '5px'
        }}>
          <span>Ichimoku</span>
          <span style={{ fontSize: '10px' }}>{showIchimoku ? '✓' : '○'}</span>
        </button>

        {/* Numerology toggle */}
        <button onClick={() => setShowNumerology(!showNumerology)} style={{
          padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
          background: showNumerology ? '#9C27B0' : '#e0e0e0', color: showNumerology ? 'white' : '#333', display: 'flex', alignItems: 'center', gap: '5px'
        }}>
          <span>PY/PM</span>
          <span style={{ fontSize: '10px' }}>{showNumerology ? '✓' : '○'}</span>
        </button>

        {/* Current PY/PM display */}
        {showNumerology && currentData && currentData.py !== 0 && incorporationDate !== 'N/A' && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f5f5f5', padding: '6px 12px', borderRadius: '4px' }}>
            <span style={{ color: '#666', fontSize: '12px' }}>Inc: {incorporationDate}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#666', fontSize: '11px' }}>PY:</span>
              <span style={{
                background: getNumerologyColor(currentData.py), color: '#fff', padding: '2px 8px',
                borderRadius: '10px', fontSize: '12px', fontWeight: 'bold'
              }}>{currentData.py}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#666', fontSize: '11px' }}>PM:</span>
              <span style={{
                background: getNumerologyColor(currentData.pm), color: '#fff', padding: '2px 8px',
                borderRadius: '10px', fontSize: '12px', fontWeight: 'bold'
              }}>{currentData.pm}</span>
            </span>
          </div>
        )}

        {/* Indicator Legend */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto', fontSize: '11px' }}>
          {showEMA && (
            <>
              <span style={{ color: '#2196F3' }}>● EMA12</span>
              <span style={{ color: '#FF5722' }}>● EMA26</span>
              <span style={{ color: '#9C27B0' }}>● SMA9</span>
            </>
          )}
          {showIchimoku && (
            <>
              <span style={{ color: '#0D47A1' }}>● Tenkan</span>
              <span style={{ color: '#B71C1C' }}>● Kijun</span>
              <span style={{ color: 'rgba(76, 175, 80, 0.5)' }}>█ Cloud</span>
            </>
          )}
        </div>
      </div>

      {/* Chart Container */}
      <div style={{ flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e0e0e0' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.9)', color: '#333', fontSize: '16px', zIndex: 10
          }}>⏳ Loading {chartInterval} chart...</div>
        )}
        {error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.9)', color: '#ef5350', fontSize: '14px', zIndex: 10, gap: '8px'
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
            {/* Volume Chart */}
            <Chart id={2} height={volumeChartHeight} origin={volumeChartOrigin} yExtents={volumeExtents}>
              <BarSeries fillStyle={volumeColor} yAccessor={(d: IOHLCData) => d.volume} />
              <YAxis
                axisAt="right"
                orient="right"
                ticks={2}
                tickFormat={volumeFormat}
                strokeStyle="#e0e0e0"
                tickLabelFill="#999"
              />
            </Chart>

            {/* Main Candlestick Chart */}
            <Chart id={1} height={candleChartHeight} yExtents={candleChartExtents}>
              <XAxis
                showGridLines
                gridLinesStrokeStyle="#f0f0f0"
                strokeStyle="#e0e0e0"
                tickLabelFill="#666"
              />
              <YAxis
                axisAt="right"
                orient="right"
                showGridLines
                gridLinesStrokeStyle="#f0f0f0"
                strokeStyle="#e0e0e0"
                tickLabelFill="#666"
                tickFormat={pricesDisplayFormat}
              />

              {/* Ichimoku Cloud - Kumo (Cloud) */}
              {showIchimoku && (
                <>
                  {/* Tenkan-sen (Conversion Line) - Blue */}
                  <LineSeries
                    yAccessor={(d: IOHLCData) => d.tenkanSen}
                    strokeStyle="#0D47A1"
                    strokeWidth={1}
                  />
                  {/* Kijun-sen (Base Line) - Red */}
                  <LineSeries
                    yAccessor={(d: IOHLCData) => d.kijunSen}
                    strokeStyle="#B71C1C"
                    strokeWidth={1}
                  />
                  {/* Senkou Span A - Green */}
                  <LineSeries
                    yAccessor={(d: IOHLCData) => d.senkouSpanA}
                    strokeStyle="rgba(76, 175, 80, 0.7)"
                    strokeWidth={1}
                  />
                  {/* Senkou Span B - Red */}
                  <LineSeries
                    yAccessor={(d: IOHLCData) => d.senkouSpanB}
                    strokeStyle="rgba(244, 67, 54, 0.7)"
                    strokeWidth={1}
                  />
                  {/* Chikou Span (Lagging) - Purple */}
                  <LineSeries
                    yAccessor={(d: IOHLCData) => d.chikouSpan}
                    strokeStyle="#7B1FA2"
                    strokeWidth={1}
                  />
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
                  <LineSeries yAccessor={sma9.accessor()} strokeStyle="#9C27B0" strokeWidth={1} />
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

              <MouseCoordinateY
                at="right"
                orient="right"
                displayFormat={pricesDisplayFormat}
                rectWidth={margin.right}
                fill="#f5f5f5"
                textFill="#333"
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

              <OHLCTooltip
                origin={[8, 16]}
                textFill="#333"
                labelFill="#666"
              />

              {showEMA && (
                <MovingAverageTooltip
                  origin={[8, 36]}
                  options={[
                    { yAccessor: ema12.accessor(), type: 'EMA', stroke: '#2196F3', windowSize: 12 },
                    { yAccessor: ema26.accessor(), type: 'EMA', stroke: '#FF5722', windowSize: 26 },
                    { yAccessor: sma9.accessor(), type: 'SMA', stroke: '#9C27B0', windowSize: 9 },
                  ]}
                />
              )}

              <ZoomButtons />
            </Chart>

            <CrossHairCursor strokeStyle="#999" />
          </ChartCanvas>
        )}
      </div>

      {/* Footer hint */}
      <div style={{ color: '#999', fontSize: '11px', textAlign: 'center', marginTop: '8px' }}>
        💡 Scroll to zoom • Drag to pan • Toggle indicators above • Ichimoku: Tenkan (blue), Kijun (red), Cloud (green/red area)
      </div>
    </div>
  );
}