const ccxt = require('ccxt');
const config = require('../config');
const logger = require('./logger');

class Exchange {
    constructor() {
        this.client = new ccxt[config.exchange]({
            apiKey: config.apiKey,
            secret: config.apiSecret,
            enableRateLimit: true,
            options: { defaultType: 'spot' },
        });
        this.paper = config.paperTrading;
    }

    async init() {
        try {
            await this.client.loadMarkets();
            logger.info(`Exchange connecté: ${config.exchange.toUpperCase()} | Mode: ${this.paper ? '📄 PAPER' : '💰 LIVE'}`);
        } catch (err) {
            logger.warn(`Exchange hors ligne, mode paper activé: ${err.message}`);
            this.paper = true;
        }
    }

    // Récupère les N dernières bougies OHLCV
    async getCandles(symbol, timeframe, limit = 100) {
        try {
            const ohlcv = await this.client.fetchOHLCV(symbol, timeframe, undefined, limit);
            return ohlcv.map(([ts, o, h, l, c, v]) => ({
                timestamp: ts, open: o, high: h, low: l, close: c, volume: v
            }));
        } catch (err) {
            logger.error(`getCandles error: ${err.message}`);
            return null;
        }
    }

    async getTicker(symbol) {
        try {
            return await this.client.fetchTicker(symbol);
        } catch (err) {
            logger.error(`getTicker error: ${err.message}`);
            return null;
        }
    }

    async getBalance() {
        if (this.paper) return null;
        try {
            const bal = await this.client.fetchBalance();
            return bal.free;
        } catch (err) {
            logger.error(`getBalance error: ${err.message}`);
            return null;
        }
    }

    async placeOrder(symbol, side, amount, price = null) {
        if (this.paper) {
            logger.info(`[PAPER] ${side.toUpperCase()} ${amount} @ ${price || 'MARKET'}`);
            return { id: `PAPER_${Date.now()}`, side, amount, price, status: 'filled' };
        }
        try {
            const type = price ? 'limit' : 'market';
            const order = await this.client.createOrder(symbol, type, side, amount, price);
            logger.info(`Ordre passé: ${side.toUpperCase()} ${amount} @ ${price || 'MARKET'} → ID: ${order.id}`);
            return order;
        } catch (err) {
            logger.error(`placeOrder error: ${err.message}`);
            return null;
        }
    }

    async cancelOrder(id, symbol) {
        if (this.paper) return true;
        try {
            await this.client.cancelOrder(id, symbol);
            return true;
        } catch (err) {
            logger.error(`cancelOrder error: ${err.message}`);
            return false;
        }
    }
}

module.exports = Exchange;
