'use client';

import { useEffect, useRef, useState } from 'react';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables, CandlestickController, CandlestickElement);

interface StockChartProps {
  instrumentKey: string;
  symbol: string;
  companyName: string;
  incorporationDate: string;
  dateRange: string;
  accessToken: string;
  onClose: () => void;
}

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

  useEffect(() => {
    loadChartData();
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [instrumentKey, dateRange]);

  const loadChartData = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Calculate date range
      const toDate = new Date().toISOString().split('T')[0];
      let fromDate: Date;
      
      switch(dateRange) {
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
      
      // Transform data for Chart.js
      const candles = data.data.candles.reverse().map((c: any) => ({
        x: new Date(c[0]).getTime(),
        o: c[1], // open
        h: c[2], // high
        l: c[3], // low
        c: c[4]  // close
      }));
      
      setChartData(candles);
      renderChart(candles);
      setLoading(false);
    } catch (err: any) {
      console.error('Chart data error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const renderChart = (candles: any[]) => {
    if (!chartRef.current) return;
    
    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;
    
    const config: ChartConfiguration = {
      type: 'candlestick',
      data: {
        datasets: [{
          label: symbol,
          data: candles
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `${symbol} - ${companyName}`,
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          subtitle: {
            display: true,
            text: `Incorporation: ${incorporationDate} | Range: ${dateRange}`,
            font: {
              size: 12
            }
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                const point = context.raw;
                return [
                  `Open: ₹${point.o.toFixed(2)}`,
                  `High: ₹${point.h.toFixed(2)}`,
                  `Low: ₹${point.l.toFixed(2)}`,
                  `Close: ₹${point.c.toFixed(2)}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: dateRange === '1Y' ? 'month' : 'year',
              displayFormats: {
                month: 'MMM yyyy',
                year: 'yyyy'
              }
            },
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Price (₹)'
            }
          }
        }
      }
    };
    
    chartInstance.current = new Chart(ctx, config);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.9)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
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
      
      {loading && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px'
        }}>
          ⏳ Loading chart data...
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
          position: 'relative'
        }}>
          <canvas ref={chartRef}></canvas>
        </div>
      )}
      
      {!loading && !error && chartData && (
        <div style={{
          marginTop: '15px',
          display: 'flex',
          gap: '20px',
          color: 'white',
          fontSize: '14px',
          justifyContent: 'center'
        }}>
          <div>
            <span style={{ opacity: 0.7 }}>Data Points:</span> <strong>{chartData.length}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>First:</span> <strong>{new Date(chartData[0].x).toLocaleDateString('en-IN')}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Latest:</span> <strong>{new Date(chartData[chartData.length - 1].x).toLocaleDateString('en-IN')}</strong>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Latest Price:</span> <strong>₹{chartData[chartData.length - 1].c.toFixed(2)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}