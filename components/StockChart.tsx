'use client';

import { useEffect, useRef, useState } from 'react';
import { calculatePersonalYear, calculatePersonalMonth } from '@/lib/numerology';

// Declare the global lightweight-charts library
declare global {
  interface Window {
    LightweightCharts: any;
  }
}

interface StockChartProps {
  instrumentKey: string;
  symbol: string;
  companyName: string;
  incorporationDate: string;
  dateRange: string;
  accessToken: string;
  onClose: () => void;
}

interface NumerologyMarker {
  time: string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text: string;
}

// Color palette for numerology numbers
const NUMEROLOGY_COLORS: Record<number, string> = {
  1: '#FF6B6B', // Red - New beginnings
  2: '#4ECDC4', // Teal - Partnership
  3: '#FFE66D', // Yellow - Creativity
  4: '#95E1D3', // Light green - Stability
  5: '#F38181', // Coral - Change
  6: '#AA96DA', // Purple - Harmony
  7: '#7FB3D5', // Blue - Introspection
  8: '#2ECC71', // Green - Abundance
  9: '#E74C3C', // Dark red - Completion
  11: '#9B59B6', // Violet - Master number
  22: '#F39C12', // Orange - Master builder
  28: '#3498DB', // Blue - Success
  33: '#E91E63', // Pink - Master teacher
  20: '#00BCD4', // Cyan - Awakening
};

export function StockChart({
  instrumentKey,
  symbol,
  companyName,
  incorporationDate,
  dateRange,
  accessToken,
  onClose
}: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartInfo, setChartInfo] = useState<{
    dataPoints: number;
    firstDate: string;
    lastDate: string;
    lastPrice: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.LightweightCharts) {
      loadChartData();
    } else {
      // Wait for library to load
      const checkLibrary = setInterval(() => {
        if (typeof window !== 'undefined' && window.LightweightCharts) {
          clearInterval(checkLibrary);
          loadChartData();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkLibrary);
        if (!window.LightweightCharts) {
          setError('Chart library failed to load. Please refresh the page.');
          setLoading(false);
        }
      }, 5000);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [instrumentKey, dateRange]);

  const loadChartData = async () => {
    setLoading(true);
    setError('');

    try {
      // Calculate date range
      const toDate = new Date().toISOString().split('T')[0];
      let fromDate: Date = new Date();

      switch (dateRange) {
        case '1Y': fromDate.setFullYear(fromDate.getFullYear() - 1); break;
        case '2Y': fromDate.setFullYear(fromDate.getFullYear() - 2); break;
        case '5Y': fromDate.setFullYear(fromDate.getFullYear() - 5); break;
        case '10Y': fromDate.setFullYear(fromDate.getFullYear() - 10); break;
        default: fromDate.setFullYear(fromDate.getFullYear() - 1);
      }

      const fromDateStr = fromDate.toISOString().split('T')[0];

      // Fetch data from Upstox API
      const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${toDate}/${fromDateStr}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }

      const data = await response.json();

      if (!data.data?.candles || data.data.candles.length === 0) {
        throw new Error('No data available for this period');
      }

      // Transform data for Lightweight Charts (needs ascending order)
      // Upstox returns: [timestamp, open, high, low, close, volume, oi]
      const candles = data.data.candles.reverse().map((c: any) => ({
        time: c[0].split('T')[0], // YYYY-MM-DD format
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4]
      }));

      // Calculate numerology markers
      const markers = calculateNumerologyMarkers(candles, incorporationDate);

      // Render the chart
      renderChart(candles, markers);

      // Set info
      setChartInfo({
        dataPoints: candles.length,
        firstDate: candles[0].time,
        lastDate: candles[candles.length - 1].time,
        lastPrice: candles[candles.length - 1].close
      });

      setLoading(false);
    } catch (err: any) {
      console.error('Chart data error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const calculateNumerologyMarkers = (candles: any[], incDate: string): NumerologyMarker[] => {
    const markers: NumerologyMarker[] = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Track which months we've already added markers for
    const processedMonths = new Set<string>();

    for (const candle of candles) {
      const date = new Date(candle.time);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

      // Only add one marker per month (first trading day of the month)
      if (processedMonths.has(monthKey)) continue;
      processedMonths.add(monthKey);

      const monthYearStr = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

      try {
        const personalYear = calculatePersonalYear(incDate, monthYearStr);
        const personalMonth = calculatePersonalMonth(incDate, monthYearStr);

        // Add Personal Year marker (above bar)
        markers.push({
          time: candle.time,
          position: 'aboveBar',
          color: NUMEROLOGY_COLORS[personalYear] || '#888888',
          shape: 'circle',
          text: `PY${personalYear}`
        });

        // Add Personal Month marker (below bar)
        markers.push({
          time: candle.time,
          position: 'belowBar',
          color: NUMEROLOGY_COLORS[personalMonth] || '#888888',
          shape: 'square',
          text: `PM${personalMonth}`
        });
      } catch (e) {
        console.warn('Numerology calculation error for', monthYearStr, e);
      }
    }

    return markers;
  };

  const renderChart = (candles: any[], markers: NumerologyMarker[]) => {
    if (!chartContainerRef.current || !window.LightweightCharts) return;

    // Remove existing chart
    if (chartRef.current) {
      chartRef.current.remove();
    }

    // Create chart
    const chart = window.LightweightCharts.createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: '#1e1e1e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: window.LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#485c7b',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#485c7b',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // Create candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    // Set candlestick data
    candlestickSeries.setData(candles);

    // Set numerology markers
    if (markers.length > 0) {
      candlestickSeries.setMarkers(markers);
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.95)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px',
        color: 'white'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>📊 {symbol} - {companyName}</h2>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            Incorporation: {incorporationDate} | Range: {dateRange}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: '#ef5350',
            border: 'none',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '10px',
        fontSize: '11px',
        color: '#aaa',
        flexWrap: 'wrap'
      }}>
        <span>🔵 PY = Personal Year</span>
        <span>🟩 PM = Personal Month</span>
        <span style={{ marginLeft: 'auto', color: '#666' }}>
          Numbers are colored based on numerology significance
        </span>
      </div>

      {/* Chart Container */}
      <div style={{
        flex: 1,
        background: '#1e1e1e',
        borderRadius: '10px',
        overflow: 'hidden',
        position: 'relative',
        minHeight: '400px'
      }}>
        {loading && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            background: '#1e1e1e'
          }}>
            ⏳ Loading chart data...
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef5350',
            fontSize: '16px',
            gap: '10px',
            background: '#1e1e1e'
          }}>
            <div>❌ Error loading chart</div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{error}</div>
          </div>
        )}

        <div
          ref={chartContainerRef}
          style={{
            width: '100%',
            height: '100%',
            display: loading || error ? 'none' : 'block'
          }}
        />
      </div>

      {/* Footer Info */}
      {!loading && !error && chartInfo && (
        <div style={{
          marginTop: '15px',
          display: 'flex',
          gap: '30px',
          color: 'white',
          fontSize: '13px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <div>
            <span style={{ opacity: 0.6 }}>Data Points:</span>{' '}
            <strong>{chartInfo.dataPoints}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>From:</span>{' '}
            <strong>{new Date(chartInfo.firstDate).toLocaleDateString('en-IN')}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>To:</span>{' '}
            <strong>{new Date(chartInfo.lastDate).toLocaleDateString('en-IN')}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>Last Price:</span>{' '}
            <strong>₹{chartInfo.lastPrice.toFixed(2)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}