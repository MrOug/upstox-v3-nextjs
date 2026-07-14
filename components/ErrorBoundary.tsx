'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error.name, error.message);
    console.error('Component stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', background: '#1E1E2E', color: '#DDD',
          fontFamily: 'JetBrains Mono, monospace', gap: '20px',
          zIndex: 10000, padding: '20px'
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>
            {this.props.fallbackTitle || 'Chart Crashed'}
          </div>
          <div style={{
            fontSize: '12px', color: '#f87171', maxWidth: '500px',
            textAlign: 'center', padding: '12px', background: 'rgba(248,113,113,0.1)',
            borderRadius: '6px', border: '1px solid rgba(248,113,113,0.3)',
            wordBreak: 'break-word'
          }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={this.handleRetry} style={{
              padding: '10px 24px', border: 'none', borderRadius: '4px',
              cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              background: '#4CAF50', color: 'white', fontFamily: 'inherit'
            }}>
              ↻ Retry
            </button>
            <button onClick={() => window.location.reload()} style={{
              padding: '10px 24px', border: '1px solid #555', borderRadius: '4px',
              cursor: 'pointer', fontSize: '13px', background: 'transparent',
              color: '#DDD', fontFamily: 'inherit'
            }}>
              Reload Page
            </button>
          </div>
          <div style={{ fontSize: '10px', color: '#666', marginTop: '8px' }}>
            Try adjusting the date range or interval and reopening the chart.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
