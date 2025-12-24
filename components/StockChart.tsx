'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';
import { calculatePersonalYear, calculatePersonalMonth } from '@/lib/numerology';

Chart.register(...registerables, CandlestickController, CandlestickElement, OhlcController, OhlcElement);

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
    1: '#FF6B6B',  // Red
    2: '#4ECDC4',  // Teal
    3: '#FFE66D',  // Yellow
    4: '#95E1D3',  // Mint
    5: '#F38181',  // Coral
    6: '#AA96DA',  // Purple
    7: '#6C5B7B',  // Dark Purple
    8: '#355C7D',  // Navy
    9: '#F67280',  // Pink
    11: '#C3073F', // Master Red
    22: '#1A1A2E', // Master Dark
    28: '#2E4057', // Master Blue
    33: '#048A81', // Master Teal
    20: '#540D6E', // Master Purple
  };
  return colors[num] || '#888888';
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
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState<any>(null);
  const [chartInterval, setChartInterval] = useState<ChartInterval>('days');
  const [showNumerology, setShowNumerology] = useState(true);
  const [numerologyData, setNumerologyData] = useState<Array<{ date: Date, py: number, pm: number }>>([]);

  useEffect(() => {
    loadChartData();
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [instrumentKey, dateRange, chartInterval]);

  const loadChartData = async () => {
    setLoading(true);
    setError('');

    try {
      const toDate = new Date().toISOString().split('T')[0];
      let fromDate: Date;

      switch (dateRange) {
        case '1Y':
          fromDate = new Date();
          fromDate.setFullYear(fromDate.getFullYear() - 1);
          break;
        case '2Y':
          fromDate = new Date();
          fromDate.setFullYear(fromDate.getFullYear() - 2);
          break;
        case '5Y':
          fromDate = new Date();
          fromDate.setFullYear(fromDate.getFullYear() - 5);
          break;
        case '10Y':
          fromDate = new Date();
          fromDate.setFullYear(fromDate.getFullYear() - 10);
          break;
        default:
          fromDate = new Date();
          fromDate.setFullYear(fromDate.getFullYear() - 1);
      }

      const fromDateStr = fromDate.toISOString().split('T')[0];

      const response = await fetch('/api/historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrumentKey,
          interval: chartInterval,
          intervalNum: '1',
          toDate,
          fromDate: fromDateStr,
          accessToken
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

      // Transform candlestick data
      const candles = data.data.candles.reverse().map((c: any) => ({
        x: new Date(c[0]).getTime(),
        o: c[1],
        h: c[2],
        l: c[3],
        c: c[4]
      }));

      // Calculate numerology for each candle date (only if incorporation date is valid)
      if (incorporationDate && incorporationDate !== 'N/A') {
        const numData = candles.map((candle: any) => {
          const candleDate = new Date(candle.x);
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthYear = `${monthNames[candleDate.getMonth()]} ${candleDate.getFullYear()}`;

          try {
            const py = calculatePersonalYear(incorporationDate, monthYear);
            const pm = calculatePersonalMonth(incorporationDate, monthYear);
            return { date: candleDate, py, pm };
          } catch (e) {
            return { date: candleDate, py: 0, pm: 0 };
          }
        });
        setNumerologyData(numData);
      }

      setChartData(candles);
      setTimeout(() => renderChart(candles), 100);
      setLoading(false);
    } catch (err: any) {
      console.error('Chart data error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const renderChart = (candles: any[]) => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    try {
      // Prepare datasets
      const datasets: any[] = [{
        label: symbol,
        data: candles
      }];

      // Add PY/PM annotations as point markers if numerology is enabled
      if (showNumerology && numerologyData.length > 0 && incorporationDate && incorporationDate !== 'N/A') {
        // Create PY line dataset (using high prices as Y position for visibility)
        const pyData = candles.map((c: any, idx: number) => ({
          x: c.x,
          y: c.h * 1.02, // Slightly above the high
          py: numerologyData[idx]?.py || 0
        }));

        datasets.push({
          label: 'Personal Year (PY)',
          type: 'line',
          data: pyData.map((d: any) => ({ x: d.x, y: d.y })),
          borderColor: 'rgba(255, 107, 107, 0.8)',
          backgroundColor: 'transparent',
          borderWidth: 0,
          pointRadius: 6,
          pointBackgroundColor: pyData.map((d: any) => getNumerologyColor(d.py)),
          pointBorderColor: '#fff',
          pointBorderWidth: 1,
          showLine: false,
          order: 0
        });
      }

      const config: ChartConfiguration = {
        type: 'candlestick',
        data: { datasets: datasets as any },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          plugins: {
            title: {
              display: true,
              text: `${symbol} - ${companyName}`,
              font: { size: 18, weight: 'bold' },
              color: '#333'
            },
            subtitle: {
              display: true,
              text: `Incorporation: ${incorporationDate} | Range: ${dateRange} | Interval: ${chartInterval}`,
              font: { size: 12 },
              color: '#666'
            },
            legend: {
              display: showNumerology && incorporationDate !== 'N/A',
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: function (context: any) {
                  if (context.dataset.label === symbol) {
                    const point = context.raw;
                    return [
                      `Open: ₹${point.o.toFixed(2)}`,
                      `High: ₹${point.h.toFixed(2)}`,
                      `Low: ₹${point.l.toFixed(2)}`,
                      `Close: ₹${point.c.toFixed(2)}`
                    ];
                  }
                  // For numerology points
                  const idx = context.dataIndex;
                  if (numerologyData[idx]) {
                    return `PY: ${numerologyData[idx].py} | PM: ${numerologyData[idx].pm}`;
                  }
                  return '';
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: chartInterval === 'days' ? 'week' : chartInterval === 'weeks' ? 'month' : 'quarter',
                displayFormats: {
                  week: 'dd MMM',
                  month: 'MMM yyyy',
                  quarter: 'MMM yyyy'
                }
              },
              title: { display: true, text: 'Date' },
              grid: { display: true, color: 'rgba(0,0,0,0.1)' }
            },
            y: {
              title: { display: true, text: 'Price (₹)' },
              grid: { display: true, color: 'rgba(0,0,0,0.1)' }
            }
          }
        }
      };

      chartInstance.current = new Chart(ctx, config);
    } catch (chartError: any) {
      console.error('Chart render error:', chartError);
      setError(`Chart render failed: ${chartError.message}`);
    }
  };

  // Re-render chart when numerology toggle changes
  useEffect(() => {
    if (chartData && !loading) {
      renderChart(chartData);
    }
  }, [showNumerology]);

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
        <h2 style={{ margin: 0 }}>📊 {symbol} Chart</h2>
        <button
          onClick={onClose}
          style={{
            background: '#ff4444',
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

      {/* Controls Bar */}
      <div style={{
        display: 'flex',
        gap: '15px',
        marginBottom: '15px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Interval Selector */}
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <span style={{ color: '#aaa', fontSize: '12px', marginRight: '8px' }}>Interval:</span>
          {(['days', 'weeks', 'months'] as ChartInterval[]).map((interval) => (
            <button
              key={interval}
              onClick={() => setChartInterval(interval)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: chartInterval === interval ? 'bold' : 'normal',
                background: chartInterval === interval ? '#4CAF50' : '#333',
                color: 'white',
                transition: 'all 0.2s'
              }}
            >
              {interval === 'days' ? 'Daily' : interval === 'weeks' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>

        {/* Numerology Toggle */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: '#aaa', fontSize: '12px' }}>Show PY/PM:</span>
          <button
            onClick={() => setShowNumerology(!showNumerology)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              background: showNumerology ? '#9C27B0' : '#333',
              color: 'white',
              transition: 'all 0.2s'
            }}
          >
            {showNumerology ? '✓ ON' : 'OFF'}
          </button>
        </div>

        {/* Numerology Legend */}
        {showNumerology && incorporationDate !== 'N/A' && (
          <div style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.1)',
            padding: '5px 12px',
            borderRadius: '5px'
          }}>
            <span style={{ color: '#aaa', fontSize: '11px' }}>Numbers: </span>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <span key={n} style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: getNumerologyColor(n),
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: '#fff',
                fontWeight: 'bold'
              }}>
                {n}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px'
        }}>
          ⏳ Loading {chartInterval} chart data...
        </div>
      )}

      {error && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff6b6b',
          fontSize: '16px',
          gap: '10px'
        }}>
          <div>❌ Error loading chart</div>
          <div style={{ fontSize: '14px', opacity: 0.8 }}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div style={{
          flex: 1,
          background: 'white',
          borderRadius: '10px',
          padding: '20px',
          position: 'relative',
          minHeight: '400px'
        }}>
          <canvas
            ref={chartRef}
            style={{ width: '100%', height: '100%', minHeight: '400px' }}
          />
        </div>
      )}

      {/* Footer Stats */}
      {!loading && !error && chartData && (
        <div style={{
          marginTop: '15px',
          display: 'flex',
          gap: '25px',
          color: 'white',
          fontSize: '13px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <div>
            <span style={{ opacity: 0.6 }}>Data Points:</span> <strong>{chartData.length}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>First:</span> <strong>{new Date(chartData[0].x).toLocaleDateString('en-IN')}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>Latest:</span> <strong>{new Date(chartData[chartData.length - 1].x).toLocaleDateString('en-IN')}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>Latest Price:</span> <strong>₹{chartData[chartData.length - 1].c.toFixed(2)}</strong>
          </div>
          {showNumerology && numerologyData.length > 0 && numerologyData[numerologyData.length - 1].py !== 0 && (
            <>
              <div>
                <span style={{ opacity: 0.6 }}>Current PY:</span> <strong style={{ color: getNumerologyColor(numerologyData[numerologyData.length - 1].py) }}>{numerologyData[numerologyData.length - 1].py}</strong>
              </div>
              <div>
                <span style={{ opacity: 0.6 }}>Current PM:</span> <strong style={{ color: getNumerologyColor(numerologyData[numerologyData.length - 1].pm) }}>{numerologyData[numerologyData.length - 1].pm}</strong>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}