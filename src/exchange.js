const axios  = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const BASE_URL = 'https://testnet.binance.vision';

class Exchange {
    constructor() {
        this.paper     = config.paperTrading;
        this.apiKey    = config.apiKey;
        this.apiSecret = config.apiSecret;

        // Instance axios avec headers communs
        this.http = axios.create({
            baseURL: BASE_URL,
            timeout: 10000,
            headers: {
                'X-MBX-APIKEY': this.apiKey,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        // Intercepteur — log chaque erreur HTTP proprement
        this.http.interceptors.response.use(
            res => res,
            err => {
                const msg = err.response?.data?.msg || err.message;
                logger.error(`Binance API error: ${msg}`);
                return Promise.reject(new Error(msg));
            }
        );
    }

    // ── SIGNATURE HMAC SHA256 pour endpoints privés ──────────────────────────
    _sign(params) {
        const query     = new URLSearchParams({ ...params, timestamp: Date.now() }).toString();
        const signature = crypto
            .createHmac('sha256', this.apiSecret)
            .update(query)
            .digest('hex');
        return `${query}&signature=${signature}`;
    }

    // ── INIT : vérifie la connexion ───────────────────────────────────────────
    async init() {
        try {
            const res = await this.http.get('/api/v3/ping');
            logger.info(`Binance connecté ✅ | Mode: ${this.paper ? '📄 PAPER' : '💰 LIVE'}`);

            // Vérif synchronisation horloge
            const time = await this.http.get('/api/v3/time');
            const diff = Math.abs(Date.now() - time.data.serverTime);
            if (diff > 1000) logger.warn(`Décalage horloge: ${diff}ms — peut causer des erreurs de signature`);
        } catch (err) {
            logger.warn(`Binance hors ligne, mode paper forcé: ${err.message}`);
            this.paper = true;
        }
    }

    // ── BOUGIES OHLCV ─────────────────────────────────────────────────────────
    // GET /api/v3/klines
    async getCandles(symbol, timeframe, limit = 120) {
        try {
            // Binance attend BTCUSDT (sans slash)
            const pair = symbol.replace('/', '');
            const res  = await this.http.get('/api/v3/klines', {
                params: { symbol: pair, interval: timeframe, limit },
            });

            return res.data.map(k => ({
                timestamp: k[0],
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

    // ── TICKER (bid/ask/last) ─────────────────────────────────────────────────
    // GET /api/v3/ticker/bookTicker  +  /api/v3/ticker/price
    async getTicker(symbol) {
        try {
            const pair = symbol.replace('/', '');
            const [book, price] = await Promise.all([
                this.http.get('/api/v3/ticker/bookTicker', { params: { symbol: pair } }),
                this.http.get('/api/v3/ticker/price',      { params: { symbol: pair } }),
            ]);
            return {
                bid:  parseFloat(book.data.bidPrice),
                ask:  parseFloat(book.data.askPrice),
                last: parseFloat(price.data.price),
            };
        } catch (err) {
            logger.error(`getTicker error: ${err.message}`);
            return null;
        }
    }

    // ── SOLDE ─────────────────────────────────────────────────────────────────
    // GET /api/v3/account  (signé)
    async getBalance() {
        if (this.paper) return null;
        try {
            const query = this._sign({});
            const res   = await this.http.get(`/api/v3/account?${query}`);

            // Retourne un objet { BTC: x, USDT: y, ... } pour les soldes > 0
            return res.data.balances.reduce((acc, b) => {
                const free = parseFloat(b.free);
                if (free > 0) acc[b.asset] = free;
                return acc;
            }, {});
        } catch (err) {
            logger.error(`getBalance error: ${err.message}`);
            return null;
        }
    }

    // ── PASSER UN ORDRE ───────────────────────────────────────────────────────
    // POST /api/v3/order  (signé)
    async placeOrder(symbol, side, amount, price = null) {
        if (this.paper) {
            logger.info(`[PAPER] ${side.toUpperCase()} ${amount} ${symbol} @ ${price || 'MARKET'}`);
            return { id: `PAPER_${Date.now()}`, side, origQty: amount, price, status: 'FILLED' };
        }

        try {
            const pair   = symbol.replace('/', '');
            const type   = price ? 'LIMIT' : 'MARKET';
            const params = {
                symbol:    pair,
                side:      side.toUpperCase(),
                type,
                quantity:  amount,
                ...(price ? { price: price.toFixed(2), timeInForce: 'GTC' } : {}),
            };

            const query = this._sign(params);
            const res   = await this.http.post(`/api/v3/order?${query}`);

            logger.info(`Ordre passé: ${side.toUpperCase()} ${amount} @ ${price || 'MARKET'} → ID: ${res.data.orderId}`);
            return res.data;
        } catch (err) {
            logger.error(`placeOrder error: ${err.message}`);
            return null;
        }
    }

    // ── ANNULER UN ORDRE ──────────────────────────────────────────────────────
    // DELETE /api/v3/order  (signé)
    async cancelOrder(orderId, symbol) {
        if (this.paper) return true;
        try {
            const pair  = symbol.replace('/', '');
            const query = this._sign({ symbol: pair, orderId });
            await this.http.delete(`/api/v3/order?${query}`);
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
            const pair  = symbol.replace('/', '');
            const query = this._sign({ symbol: pair, orderId });
            const res   = await this.http.get(`/api/v3/order?${query}`);
            return res.data;
        } catch (err) {
            logger.error(`getOrder error: ${err.message}`);
            return null;
        }
    }

    // ── ORDRES OUVERTS ────────────────────────────────────────────────────────
    async getOpenOrders(symbol) {
        if (this.paper) return [];
        try {
            const pair  = symbol.replace('/', '');
            const query = this._sign({ symbol: pair });
            const res   = await this.http.get(`/api/v3/openOrders?${query}`);
            return res.data;
        } catch (err) {
            logger.error(`getOpenOrders error: ${err.message}`);
            return [];
        }
    }
}

module.exports = Exchange;
