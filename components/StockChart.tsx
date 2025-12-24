'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickData, Time } from 'lightweight-charts';
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartInterval, setChartInterval] = useState<ChartInterval>('days');
  const [showNumerology, setShowNumerology] = useState(true);
  const [numerologyData, setNumerologyData] = useState<Array<{ time: string, py: number, pm: number }>>([]);
  const [currentData, setCurrentData] = useState<{ price: number, py: number, pm: number } | null>(null);
  const [markers, setMarkers] = useState<any[]>([]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1E1E2E' },
        textColor: '#DDD',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#2B2B43',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    chartRef.current = chart;

    // Add candlestick series using the new v5 API
    const candlestickSeries = chart.addSeries({
      type: 'Candlestick',
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    candlestickSeriesRef.current = candlestickSeries;

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
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Load data when interval changes
  useEffect(() => {
    if (chartRef.current) {
      loadChartData();
    }
  }, [chartInterval, dateRange, instrumentKey]);

  // Update markers when numerology toggle changes
  useEffect(() => {
    if (candlestickSeriesRef.current && markers.length > 0) {
      if (showNumerology && incorporationDate && incorporationDate !== 'N/A') {
        candlestickSeriesRef.current.setMarkers(markers);
      } else {
        candlestickSeriesRef.current.setMarkers([]);
      }
    }
  }, [showNumerology, markers, incorporationDate]);

  const loadChartData = async () => {
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

      // Transform data for lightweight-charts (oldest first)
      const candles: CandlestickData[] = data.data.candles.reverse().map((c: any) => ({
        time: c[0].split('T')[0] as Time,
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4]
      }));

      // Calculate numerology and create markers
      const numData: Array<{ time: string, py: number, pm: number }> = [];
      const chartMarkers: any[] = [];

      if (incorporationDate && incorporationDate !== 'N/A') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        candles.forEach((candle, idx) => {
          const candleDate = new Date(candle.time as string);
          const monthYear = `${monthNames[candleDate.getMonth()]} ${candleDate.getFullYear()}`;

          try {
            const py = calculatePersonalYear(incorporationDate, monthYear);
            const pm = calculatePersonalMonth(incorporationDate, monthYear);
            numData.push({ time: candle.time as string, py, pm });

            // Add marker every N candles based on interval
            const markerFrequency = chartInterval === 'days' ? 20 : chartInterval === 'weeks' ? 4 : 1;
            if (idx % markerFrequency === 0) {
              chartMarkers.push({
                time: candle.time,
                position: 'aboveBar',
                color: getNumerologyColor(py),
                shape: 'circle',
                text: `${py}/${pm}`,
                size: 1
              });
            }
          } catch (e) {
            numData.push({ time: candle.time as string, py: 0, pm: 0 });
          }
        });
      }

      setNumerologyData(numData);
      setMarkers(chartMarkers);

      // Set current data (latest)
      if (candles.length > 0 && numData.length > 0) {
        const latest = candles[candles.length - 1];
        const latestNum = numData[numData.length - 1];
        setCurrentData({ price: latest.close, py: latestNum.py, pm: latestNum.pm });
      }

      // Update chart
      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(candles);

        if (showNumerology && incorporationDate && incorporationDate !== 'N/A') {
          candlestickSeriesRef.current.setMarkers(chartMarkers);
        }
      }

      // Fit content
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Chart data error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Zoom controls
  const zoomIn = () => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const currentRange = timeScale.getVisibleLogicalRange();
      if (currentRange) {
        const newRange = {
          from: currentRange.from + (currentRange.to - currentRange.from) * 0.1,
          to: currentRange.to - (currentRange.to - currentRange.from) * 0.1,
        };
        timeScale.setVisibleLogicalRange(newRange);
      }
    }
  };

  const zoomOut = () => {
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const currentRange = timeScale.getVisibleLogicalRange();
      if (currentRange) {
        const newRange = {
          from: currentRange.from - (currentRange.to - currentRange.from) * 0.2,
          to: currentRange.to + (currentRange.to - currentRange.from) * 0.2,
        };
        timeScale.setVisibleLogicalRange(newRange);
      }
    }
  };

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

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

        {/* Zoom buttons */}
        <div style={{ display: 'flex', gap: '4px', background: '#2B2B43', borderRadius: '4px', padding: '2px' }}>
          <button onClick={zoomIn} style={{ padding: '6px 12px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', background: 'transparent', color: 'white' }}>🔍+</button>
          <button onClick={zoomOut} style={{ padding: '6px 12px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', background: 'transparent', color: 'white' }}>🔍-</button>
          <button onClick={resetZoom} style={{ padding: '6px 12px', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', background: 'transparent', color: 'white' }}>Reset</button>
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
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Footer hint */}
      <div style={{ color: '#666', fontSize: '11px', textAlign: 'center', marginTop: '8px' }}>
        💡 Scroll to zoom • Drag to pan • Use buttons for precise control • Markers show PY/PM values
      </div>
    </div>
  );
}