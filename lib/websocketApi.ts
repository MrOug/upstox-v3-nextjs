'use client';

/**
 * Upstox V3 WebSocket API for Real-Time Market Data
 * 
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Support for LTP, Full Quote, and Option Greeks modes
 * - Subscribe/unsubscribe to instruments dynamically
 * - Heartbeat monitoring
 */

// WebSocket connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Subscription modes
type SubscriptionMode = 'ltpc' | 'full' | 'option_greeks';

interface WebSocketMessage {
    type: 'message' | 'error' | 'connected' | 'disconnected';
    data?: any;
    error?: string;
}

interface MarketFeedData {
    instrumentKey: string;
    ltp?: number;
    ltq?: number;
    volume?: number;
    cp?: number; // closing price
    ohlc?: {
        open: number;
        high: number;
        low: number;
        close: number;
    };
    depth?: {
        buy: { price: number; quantity: number; orders: number }[];
        sell: { price: number; quantity: number; orders: number }[];
    };
    timestamp?: number;
}

type MessageCallback = (data: MarketFeedData) => void;
type StatusCallback = (state: ConnectionState) => void;

export class UpstoxWebSocket {
    private ws: WebSocket | null = null;
    private accessToken: string = '';
    private state: ConnectionState = 'disconnected';
    private subscribedInstruments: Set<string> = new Set();
    private subscriptionMode: SubscriptionMode = 'ltpc';

    // Callbacks
    private messageCallbacks: MessageCallback[] = [];
    private statusCallbacks: StatusCallback[] = [];

    // Reconnection
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private baseReconnectDelay = 1000;
    private maxReconnectDelay = 30000;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    // Heartbeat
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private heartbeatTimeout: NodeJS.Timeout | null = null;
    private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
    private readonly HEARTBEAT_TIMEOUT = 10000; // 10 seconds

    constructor() { }

    // ============================================
    // Public API
    // ============================================

    setAccessToken(token: string) {
        this.accessToken = token;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.accessToken) {
                reject(new Error('Access token not set'));
                return;
            }

            if (this.state === 'connected' || this.state === 'connecting') {
                resolve();
                return;
            }

            this.updateState('connecting');

            try {
                // Upstox V3 WebSocket URL
                const wsUrl = `wss://api.upstox.com/v3/feed/market-data-feed?token=${this.accessToken}`;

                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('✓ WebSocket connected');
                    this.reconnectAttempts = 0;
                    this.updateState('connected');
                    this.startHeartbeat();

                    // Resubscribe to previously subscribed instruments
                    if (this.subscribedInstruments.size > 0) {
                        this.sendSubscription(Array.from(this.subscribedInstruments), 'subscribe');
                    }

                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.notifyCallbacks({ type: 'error', error: 'Connection error' });
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason);
                    this.stopHeartbeat();
                    this.updateState('disconnected');

                    // Auto-reconnect if not intentionally closed
                    if (event.code !== 1000) {
                        this.scheduleReconnect();
                    }
                };

            } catch (error: any) {
                this.updateState('disconnected');
                reject(error);
            }
        });
    }

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close(1000, 'Client disconnected');
            this.ws = null;
        }

        this.updateState('disconnected');
        this.subscribedInstruments.clear();
        console.log('✓ WebSocket disconnected');
    }

    subscribe(instrumentKeys: string[], mode: SubscriptionMode = 'ltpc') {
        this.subscriptionMode = mode;
        instrumentKeys.forEach(key => this.subscribedInstruments.add(key));

        if (this.state === 'connected') {
            this.sendSubscription(instrumentKeys, 'subscribe');
        }
    }

    unsubscribe(instrumentKeys: string[]) {
        instrumentKeys.forEach(key => this.subscribedInstruments.delete(key));

        if (this.state === 'connected') {
            this.sendSubscription(instrumentKeys, 'unsubscribe');
        }
    }

    onMessage(callback: MessageCallback) {
        this.messageCallbacks.push(callback);
        return () => {
            this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
        };
    }

    onStatusChange(callback: StatusCallback) {
        this.statusCallbacks.push(callback);
        return () => {
            this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
        };
    }

    getState(): ConnectionState {
        return this.state;
    }

    isConnected(): boolean {
        return this.state === 'connected';
    }

    // ============================================
    // Private Methods
    // ============================================

    private updateState(newState: ConnectionState) {
        this.state = newState;
        this.statusCallbacks.forEach(cb => cb(newState));
    }

    private sendSubscription(instrumentKeys: string[], action: 'subscribe' | 'unsubscribe') {
        if (!this.ws || this.state !== 'connected') return;

        const message = {
            guid: this.generateGuid(),
            method: action === 'subscribe' ? 'sub' : 'unsub',
            data: {
                mode: this.subscriptionMode,
                instrumentKeys: instrumentKeys
            }
        };

        try {
            this.ws.send(JSON.stringify(message));
            console.log(`✓ ${action} sent for ${instrumentKeys.length} instruments`);
        } catch (error) {
            console.error('Failed to send subscription:', error);
        }
    }

    private handleMessage(event: MessageEvent) {
        try {
            // Reset heartbeat timer on any message
            this.resetHeartbeatTimeout();

            // Parse message - Upstox uses binary protobuf, but fallback to JSON
            let data: any;

            if (typeof event.data === 'string') {
                data = JSON.parse(event.data);
            } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                // For binary data, we'd need protobuf decoder
                // For now, log and skip
                console.log('Received binary message (protobuf)');
                return;
            } else {
                return;
            }

            // Handle different message types
            if (data.type === 'ack') {
                console.log('✓ Subscription acknowledged');
                return;
            }

            if (data.type === 'error') {
                console.error('WebSocket error message:', data.message);
                return;
            }

            // Process market data
            if (data.feeds) {
                Object.entries(data.feeds).forEach(([instrumentKey, feedData]: [string, any]) => {
                    const marketData: MarketFeedData = {
                        instrumentKey,
                        ltp: feedData.ltpc?.ltp || feedData.ff?.marketFF?.ltpc?.ltp,
                        ltq: feedData.ltpc?.ltq,
                        cp: feedData.ltpc?.cp,
                        volume: feedData.ltpc?.v,
                        timestamp: feedData.ltpc?.ltt
                    };

                    // If full mode, include OHLC and depth
                    if (feedData.ff?.marketFF?.marketOHLC) {
                        const ohlc = feedData.ff.marketFF.marketOHLC.ohlc?.[0];
                        if (ohlc) {
                            marketData.ohlc = {
                                open: ohlc.open,
                                high: ohlc.high,
                                low: ohlc.low,
                                close: ohlc.close
                            };
                        }
                    }

                    this.messageCallbacks.forEach(cb => cb(marketData));
                });
            }

        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    private scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Max reconnect attempts reached');
            this.updateState('disconnected');
            return;
        }

        this.updateState('reconnecting');
        this.reconnectAttempts++;

        // Exponential backoff with jitter
        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
            this.maxReconnectDelay
        );

        console.log(`🔄 Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimeout = setTimeout(() => {
            this.connect().catch(err => {
                console.error('Reconnect failed:', err);
            });
        }, delay);
    }

    private startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.state === 'connected') {
                // Send ping
                try {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (e) {
                    console.error('Failed to send heartbeat:', e);
                }

                // Set timeout for pong response
                this.heartbeatTimeout = setTimeout(() => {
                    console.log('⚠️ Heartbeat timeout, reconnecting...');
                    this.ws?.close();
                }, this.HEARTBEAT_TIMEOUT);
            }
        }, this.HEARTBEAT_INTERVAL);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    private resetHeartbeatTimeout() {
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    private generateGuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    private notifyCallbacks(message: WebSocketMessage) {
        if (message.type === 'error') {
            console.error('WebSocket notification:', message.error);
        }
    }
}

// Singleton instance
export const upstoxWebSocket = new UpstoxWebSocket();
