require('dotenv').config();
const config        = require('../config');
const logger        = require('./logger');
const Exchange      = require('./exchange');
const Indicators    = require('./indicators');
const { getScore, getSignal, getLevels, getPositionSize } = require('./score');
const RiskManager   = require('./risk');
const Telegram      = require('./telegram');
const SessionFilter = require('./session');

// ─── PAPER TRADING STATE (mode simulation) ────────────────────────────────────
const paperState = {
    capital: config.capital,
    position: null,
};

class Bot {
    constructor() {
        this.exchange  = new Exchange();
        this.ind       = new Indicators();
        this.risk      = new RiskManager(config.capital);
        this.telegram  = new Telegram();
        this.session   = new SessionFilter();
        this.running   = false;
        this.loopMs    = this._timeframeToMs(config.timeframe);
        this.isPaper   = config.paperTrading;
    }

    async start() {
        logger.info('═══════════════════════════════════════════');
        logger.info('    🤖 BTC SCALPING BOT — Démarrage');
        logger.info(`    Symbole : ${config.symbol}`);
        logger.info(`    TF      : ${config.timeframe}`);
        logger.info(`    Capital : $${config.capital}`);
        logger.info(`    Mode    : ${this.isPaper ? '📄 PAPER TRADING' : '💰 LIVE'}`);
        logger.info('═══════════════════════════════════════════');

        await this.exchange.init();
        await this.telegram.send('🤖 Bot démarré — ' + (this.isPaper ? 'PAPER MODE' : 'LIVE MODE'));

        this.running = true;
        await this._loop();
    }

    async _loop() {
        while (this.running) {
            try {
                await this._tick();
            } catch (err) {
                logger.error(`Erreur dans le loop: ${err.message}`);
            }
            await this._sleep(this.loopMs);
        }
    }

    async _tick() {
        // ── 1. Session check ──
        const { session, recommended, multiplier } = this.session.isTradingSession();
        if (!recommended && !this.risk.hasPosition()) {
            logger.debug(`Session ${session} — faible liquidité, en attente...`);
            return;
        }

        // ── 2. Données marché ──
        const candles = await this.exchange.getCandles(config.symbol, config.timeframe, 120);
        if (!candles || candles.length < 60) {
            logger.warn('Données insuffisantes');
            return;
        }

        // ── 3. Calcul indicateurs ──
        const ind = this.ind.compute(candles);
        if (!ind) { logger.warn('Calcul indicateurs échoué'); return; }

        const regime   = this.ind.detectRegime(ind);
        const breakout = this.ind.detectBreakout(candles);

        // ── 4. Score & signal ──
        let score  = getScore(ind, regime, breakout);
        score      = Math.round(score * multiplier);  // bonus session overlap
        const signal = getSignal(score, ind, regime, breakout);

        logger.info(`[${session}] Prix: $${ind.last.toFixed(2)} | RSI: ${ind.rsi.toFixed(1)} | Score: ${score} | Signal: ${signal} | Régime: ${regime}`);

        // ── 5. Gestion position existante ──
        if (this.risk.hasPosition()) {
            this.risk.applyTrailing(ind.last);
            const exit = this.risk.checkExits(ind.last);

            if (exit || signal === 'EXIT') {
                const reason = exit || 'SIGNAL_EXIT';
                await this._closePosition(ind.last, reason);
            }
            return;
        }

        // ── 6. Ouverture nouvelle position ──
        if (!this.risk.canTrade()) return;
        if (signal !== 'BUY' && signal !== 'SELL') return;

        const levels = getLevels(ind.last, signal, ind.atr);
        const size   = getPositionSize(this.risk.capital, levels.entry, levels.sl);

        if (size <= 0) { logger.warn('Taille de position nulle'); return; }

        // Vérif spread acceptable (depuis l'image: HTX spread $0.1 = excellent)
        const ticker = await this.exchange.getTicker(config.symbol);
        if (ticker) {
            const spread = ticker.ask - ticker.bid;
            const spreadPct = (spread / ticker.last) * 100;
            if (spreadPct > 0.05) {
                logger.warn(`Spread trop élevé: ${spreadPct.toFixed(3)}% → skip`);
                return;
            }
        }

        const side  = signal === 'BUY' ? 'buy' : 'sell';
        const order = await this.exchange.placeOrder(config.symbol, side, size);

        if (order) {
            this.risk.openPosition({
                side: signal,
                entry: ind.last,
                sl: levels.sl,
                tp1: levels.tp1,
                tp2: levels.tp2,
                size,
                orderId: order.id,
            });
            await this.telegram.signalAlert(signal, ind, levels, score, regime);
        }
    }

    async _closePosition(price, reason) {
        const side  = this.risk.position.side === 'BUY' ? 'sell' : 'buy';
        const size  = this.risk.position.size;
        await this.exchange.placeOrder(config.symbol, side, size);

        const record = this.risk.closePosition(price, reason);
        if (record) {
            await this.telegram.tradeAlert(record);
            this._printStats();
        }
    }

    _printStats() {
        const s = this.risk.getStats();
        logger.info('──── STATS ────────────────────────────────');
        logger.info(`Trades: ${s.totalTrades} | Win: ${s.winRate} | R/R: ${s.riskReward}`);
        logger.info(`PnL: ${s.totalPnl >= 0 ? '+' : ''}${s.totalPnl} USDT | ROI: ${s.roi}`);
        logger.info(`Drawdown max: ${s.maxDrawdown} | Capital: $${s.capital}`);
        logger.info('───────────────────────────────────────────');
    }

    stop() {
        this.running = false;
        const stats = this.risk.getStats();
        this.telegram.statsAlert(stats);
        logger.info('Bot arrêté. Stats finales:');
        this._printStats();
    }

    _timeframeToMs(tf) {
        const map = { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000 };
        return map[tf] || 60000;
    }

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
const bot = new Bot();

process.on('SIGINT', () => {
    logger.info('Interruption reçue — arrêt propre...');
    bot.stop();
    process.exit(0);
});

bot.start().catch(err => {
    logger.error(`Erreur fatale: ${err.message}`);
    process.exit(1);
});
