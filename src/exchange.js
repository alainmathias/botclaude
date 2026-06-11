const axios  = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const BASE_URL = 'https://api-api.bybit.com';

class Exchange {
    constructor() {
        this.paper     = config.paperTrading;
        this.apiKey    = config.apiKey;
        this.apiSecret = config.apiSecret;
        this.recvWindow = 5000;

        this.http = axios.create({
            baseURL: BASE_URL,
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' },
        });

        this.http.interceptors.response.use(
            res => res,
            err => {
                const msg = err.response?.data?.retMsg || err.message;
                logger.error(`Bybit API error: ${msg}`);
                return Promise.reject(new Error(msg));
            }
        );
    }

    // ── SIGNATURE Bybit (HMAC SHA256) ─────────────────────────────────────────
    // Format: timestamp + apiKey + recvWindow + queryString
    _sign(params) {
        const timestamp = Date.now().toString();
        const query     = new URLSearchParams(params).toString();
        const payload   = timestamp + this.apiKey + this.recvWindow + query;
        const signature = crypto
            .createHmac('sha256', this.apiSecret)
            .update(payload)
            .digest('hex');
        return { timestamp, signature, query };
    }

    _authHeaders(timestamp, signature) {
        return {
            'X-BAPI-API-KEY':     this.apiKey,
            'X-BAPI-TIMESTAMP':   timestamp,
            'X-BAPI-SIGN':        signature,
            'X-BAPI-RECV-WINDOW': String(this.recvWindow),
        };
    }

    // ── INIT ──────────────────────────────────────────────────────────────────
    async init() {
        try {
            const res = await this.http.get('/v5/market/time');
            if (res.data.retCode === 0) {
                logger.info(`Bybit connecté ✅ | Mode: ${this.paper ? '📄 PAPER' : '💰 LIVE'}`);
            }
        } catch (err) {
            logger.warn(`Bybit hors ligne, mode paper forcé: ${err.message}`);
            this.paper = true;
        }
    }

    // ── BOUGIES OHLCV ─────────────────────────────────────────────────────────
    // GET /v5/market/kline
    async getCandles(symbol, timeframe, limit = 120) {
        try {
            const pair     = symbol.replace('/', '');  // BTC/USDT → BTCUSDT
            const interval = this._tfToBybit(timeframe);
            const res      = await this.http.get('/v5/market/kline', {
                params: { category: 'spot', symbol: pair, interval, limit },
            });

            if (res.data.retCode !== 0) throw new Error(res.data.retMsg);

            // Bybit retourne les bougies en ordre décroissant → inverser
            return res.data.result.list.reverse().map(k => ({
                timestamp: parseInt(k[0]),
                open:      parseFloat(k[1]),
                high:      parseFloat(k[2]),
                low:       parseFloat(k[3]),
                close:     parseFloat(k[4]),
                volume:    parseFloat(k[5]),
            }));
        } catch (err) {
            logger.error(`getCandles error: ${err.message}`);
            return null;
        }
    }

    // ── TICKER bid/ask/last ───────────────────────────────────────────────────
    // GET /v5/market/tickers
    async getTicker(symbol) {
        try {
            const pair = symbol.replace('/', '');
            const res  = await this.http.get('/v5/market/tickers', {
                params: { category: 'spot', symbol: pair },
            });

            if (res.data.retCode !== 0) throw new Error(res.data.retMsg);

            const t = res.data.result.list[0];
            return {
                bid:  parseFloat(t.bid1Price),
                ask:  parseFloat(t.ask1Price),
                last: parseFloat(t.lastPrice),
            };
        } catch (err) {
            logger.error(`getTicker error: ${err.message}`);
            return null;
        }
    }

    // ── SOLDE ─────────────────────────────────────────────────────────────────
    // GET /v5/account/wallet-balance  (signé)
    async getBalance() {
        if (this.paper) return null;
        try {
            const params = { accountType: 'UNIFIED' };
            const { timestamp, signature, query } = this._sign(params);
            const res = await this.http.get(`/v5/account/wallet-balance?${query}`, {
                headers: this._authHeaders(timestamp, signature),
            });

            if (res.data.retCode !== 0) throw new Error(res.data.retMsg);

            const coins = res.data.result.list[0]?.coin || [];
            return coins.reduce((acc, c) => {
                const free = parseFloat(c.availableToWithdraw);
                if (free > 0) acc[c.coin] = free;
                return acc;
            }, {});
        } catch (err) {
            logger.error(`getBalance error: ${err.message}`);
            return null;
        }
    }

    // ── PASSER UN ORDRE ───────────────────────────────────────────────────────
    // POST /v5/order/create  (signé)
    async placeOrder(symbol, side, amount, price = null) {
        if (this.paper) {
            logger.info(`[PAPER] ${side.toUpperCase()} ${amount} ${symbol} @ ${price || 'MARKET'}`);
            return {
                id: `PAPER_${Date.now()}`,
                side, qty: amount, price,
                status: 'Filled',
            };
        }

        try {
            const pair = symbol.replace('/', '');
            const body = {
                category:  'spot',
                symbol:    pair,
                side:      side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(), // Buy / Sell
                orderType: price ? 'Limit' : 'Market',
                qty:       String(amount),
                ...(price ? { price: price.toFixed(2), timeInForce: 'GTC' } : {}),
            };

            const timestamp = Date.now().toString();
            const payload   = timestamp + this.apiKey + this.recvWindow + JSON.stringify(body);
            const signature = crypto
                .createHmac('sha256', this.apiSecret)
                .update(payload)
                .digest('hex');

            const res = await this.http.post('/v5/order/create', body, {
                headers: this._authHeaders(timestamp, signature),
            });

            if (res.data.retCode !== 0) throw new Error(res.data.retMsg);

            logger.info(`Ordre: ${side.toUpperCase()} ${amount} @ ${price || 'MARKET'} → ID: ${res.data.result.orderId}`);
            return res.data.result;
        } catch (err) {
            logger.error(`placeOrder error: ${err.message}`);
            return null;
        }
    }

    // ── ANNULER UN ORDRE ──────────────────────────────────────────────────────
    // POST /v5/order/cancel  (signé)
    async cancelOrder(orderId, symbol) {
        if (this.paper) return true;
        try {
            const pair = symbol.replace('/', '');
            const body = { category: 'spot', symbol: pair, orderId };

            const timestamp = Date.now().toString();
            const payload   = timestamp + this.apiKey + this.recvWindow + JSON.stringify(body);
            const signature = crypto
                .createHmac('sha256', this.apiSecret)
                .update(payload)
                .digest('hex');

            const res = await this.http.post('/v5/order/cancel', body, {
                headers: this._authHeaders(timestamp, signature),
            });

            if (res.data.retCode !== 0) throw new Error(res.data.retMsg);
            logger.info(`Ordre annulé: ${orderId}`);
            return true;
        } catch (err) {
            logger.error(`cancelOrder error: ${err.message}`);
            return false;
        }
    }

    // ── STATUT D'UN ORDRE ─────────────────────────────────────────────────────
    async getOrder(orderId, symbol) {
        if (this.paper) return null;
        try {
            const pair   = symbol.replace('/', '');
            const params = { category: 'spot', symbol: pair, orderId };
            const { timestamp, signature, query } = this._sign(params);
            const res = await this.http.get(`/v5/order/realtime?${query}`, {
                headers: this._authHeaders(timestamp, signature),
            });
            if (res.data.retCode !== 0) throw new Error(res.data.retMsg);
            return res.data.result.list[0] || null;
        } catch (err) {
            logger.error(`getOrder error: ${err.message}`);
            return null;
        }
    }

    // ── CONVERSION TIMEFRAME ──────────────────────────────────────────────────
    // Bybit: 1 3 5 15 30 60 120 240 360 720 D W M
    _tfToBybit(tf) {
        const map = {
            '1m': '1', '3m': '3', '5m': '5', '15m': '15',
            '30m': '30', '1h': '60', '2h': '120', '4h': '240',
        };
        return map[tf] || '1';
    }
}

module.exports = Exchange;