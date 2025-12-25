'use client';

import { useEffect, useState, useCallback } from 'react';
import { format } from 'd3-format';
import { timeFormat } from 'd3-time-format';
import {
  discontinuousTimeScaleProviderBuilder,
  Chart,
  ChartCanvas,
  CandlestickSeries,
  BarSeries,
  XAxis,
  YAxis,
  CrossHairCursor,
  EdgeIndicator,
  MouseCoordinateX,
  MouseCoordinateY,
  OHLCTooltip,
  ZoomButtons,
  LabelAnnotation,
  Annotate,
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

export function StockChart({
  instrumentKey, symbol, companyName, incorporationDate, dateRange, accessToken, onClose
}: StockChartProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartInterval, setChartInterval] = useState<ChartInterval>('days');
  const [showNumerology, setShowNumerology] = useState(true);
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

      setChartData(candles);

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

  // Chart configuration
  const margin = { left: 0, right: 60, top: 10, bottom: 30 };
  const pricesDisplayFormat = format('.2f');
  const volumeFormat = format('.4s');
  const xScaleProvider = discontinuousTimeScaleProviderBuilder().inputDateAccessor((d: IOHLCData) => d.date);

  // Prepare chart data
  const { data, xScale, xAccessor, displayXAccessor } = xScaleProvider(chartData);

  const max = data.length > 0 ? xAccessor(data[data.length - 1]) : 0;
  const min = data.length > 0 ? xAccessor(data[Math.max(0, data.length - 100)]) : 0;
  const xExtents = [min, max + 5];

  const gridHeight = dimensions.height - margin.top - margin.bottom;
  const volumeChartHeight = gridHeight * 0.2;
  const candleChartHeight = gridHeight * 0.8;
  const volumeChartOrigin = (_: number, h: number) => [0, h - volumeChartHeight];

  // Accessor functions
  const candleChartExtents = (d: IOHLCData) => [d.high, d.low];
  const volumeExtents = (d: IOHLCData) => d.volume;
  const volumeColor = (d: IOHLCData) => (d.close > d.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)');
  const openCloseColor = (d: IOHLCData) => (d.close > d.open ? '#26a69a' : '#ef5350');

  // Numerology annotation props - show PY/PM markers
  const markerFrequency = chartInterval === 'days' ? 20 : chartInterval === 'weeks' ? 4 : 1;

  const numerologyAnnotationProps = {
    fontFamily: 'Arial',
    fontSize: 10,
    fill: (d: IOHLCData) => getNumerologyColor(d.py || 0),
    text: (d: IOHLCData) => `${d.py}/${d.pm}`,
    y: ({ yScale, datum }: { yScale: any, datum: IOHLCData }) => yScale(datum.high) - 15,
    tooltip: (d: IOHLCData) => `PY: ${d.py}, PM: ${d.pm}`,
  };

  // Filter data for numerology markers
  const numerologyData = data.filter((_: IOHLCData, idx: number) => idx % markerFrequency === 0);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#1E1E2E', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '15px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 style={{ margin: 0, color: 'white', fontSize: '20px' }}>📊 {symbol}</h2>
          <span style={{ color: '#888', fontSize: '14px' }}>{companyName}</span>
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
        <div style={{ display: 'flex', gap: '4px', background: '#2B2B43', borderRadius: '4px', padding: '2px' }}>
          {(['days', 'weeks', 'months'] as ChartInterval[]).map((int) => (
            <button key={int} onClick={() => setChartInterval(int)} style={{
              padding: '6px 12px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px',
              background: chartInterval === int ? '#4CAF50' : 'transparent', color: 'white', fontWeight: chartInterval === int ? 'bold' : 'normal'
            }}>{int === 'days' ? '1D' : int === 'weeks' ? '1W' : '1M'}</button>
          ))}
        </div>

        {/* Numerology toggle */}
        <button onClick={() => setShowNumerology(!showNumerology)} style={{
          padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
          background: showNumerology ? '#9C27B0' : '#2B2B43', color: 'white', display: 'flex', alignItems: 'center', gap: '5px'
        }}>
          <span>PY/PM</span>
          <span style={{ fontSize: '10px' }}>{showNumerology ? '✓' : '○'}</span>
        </button>

        {/* Current PY/PM display */}
        {showNumerology && currentData && currentData.py !== 0 && incorporationDate !== 'N/A' && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#2B2B43', padding: '6px 12px', borderRadius: '4px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>Inc: {incorporationDate}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#888', fontSize: '11px' }}>PY:</span>
              <span style={{
                background: getNumerologyColor(currentData.py), color: '#fff', padding: '2px 8px',
                borderRadius: '10px', fontSize: '12px', fontWeight: 'bold'
              }}>{currentData.py}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#888', fontSize: '11px' }}>PM:</span>
              <span style={{
                background: getNumerologyColor(currentData.pm), color: '#fff', padding: '2px 8px',
                borderRadius: '10px', fontSize: '12px', fontWeight: 'bold'
              }}>{currentData.pm}</span>
            </span>
          </div>
        )}

        {/* Legend */}
        {showNumerology && incorporationDate !== 'N/A' && (
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center', marginLeft: 'auto' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <span key={n} style={{
                width: '16px', height: '16px', borderRadius: '50%', background: getNumerologyColor(n),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', color: '#fff', fontWeight: 'bold'
              }}>{n}</span>
            ))}
          </div>
        )}
      </div>

      {/* Chart Container */}
      <div style={{ flex: 1, position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,30,46,0.9)', color: 'white', fontSize: '16px', zIndex: 10
          }}>⏳ Loading {chartInterval} chart...</div>
        )}
        {error && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30,30,46,0.9)', color: '#ef5350', fontSize: '14px', zIndex: 10, gap: '8px'
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
                ticks={3}
                tickFormat={volumeFormat}
                strokeStyle="#2B2B43"
                tickLabelFill="#888"
              />
            </Chart>

            {/* Main Candlestick Chart */}
            <Chart id={1} height={candleChartHeight} yExtents={candleChartExtents}>
              <XAxis
                showGridLines
                gridLinesStrokeStyle="#2B2B43"
                strokeStyle="#2B2B43"
                tickLabelFill="#DDD"
              />
              <YAxis
                axisAt="right"
                orient="right"
                showGridLines
                gridLinesStrokeStyle="#2B2B43"
                strokeStyle="#2B2B43"
                tickLabelFill="#DDD"
                tickFormat={pricesDisplayFormat}
              />

              <CandlestickSeries
                fill={(d: IOHLCData) => d.close > d.open ? '#26a69a' : '#ef5350'}
                wickStroke={(d: IOHLCData) => d.close > d.open ? '#26a69a' : '#ef5350'}
              />

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
                fill="#2B2B43"
                textFill="#DDD"
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
                textFill="#DDD"
                labelFill="#888"
              />

              <ZoomButtons />
            </Chart>

            <CrossHairCursor strokeStyle="#888" />
          </ChartCanvas>
        )}
      </div>

      {/* Footer hint */}
      <div style={{ color: '#666', fontSize: '11px', textAlign: 'center', marginTop: '8px' }}>
        💡 Scroll to zoom • Drag to pan • Use zoom buttons for precise control • Markers show PY/PM values
      </div>
    </div>
  );
}