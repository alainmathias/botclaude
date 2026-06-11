const config = require('../config');
const logger  = require('./logger');

class Telegram {
    constructor() {
        this.enabled = config.telegramAlerts && config.telegramToken && config.telegramChatId;
        this.bot = null;

        if (this.enabled) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                this.bot = new TelegramBot(config.telegramToken, { polling: false });
                logger.info('Telegram: alertes activées');
            } catch (e) {
                logger.warn('Telegram: module non disponible');
                this.enabled = false;
            }
        }
    }

    async send(msg) {
        if (!this.enabled || !this.bot) return;
        try {
            await this.bot.sendMessage(config.telegramChatId, msg, { parse_mode: 'Markdown' });
        } catch (e) {
            logger.warn(`Telegram send error: ${e.message}`);
        }
    }

    async signalAlert(signal, ind, levels, score, regime) {
        const emoji = signal === 'BUY' ? '🟢' : signal === 'SELL' ? '🔴' : '⚪';
        const msg = [
            `${emoji} *SIGNAL ${signal}* — BTC/USD`,
            ``,
            `📍 *Prix:* $${ind.last.toFixed(2)}`,
            `📊 *Score:* ${score}/100 | *Régime:* ${regime}`,
            ``,
            `📈 *RSI:* ${ind.rsi.toFixed(1)} | *ATR:* ${ind.atr.toFixed(1)}`,
            `📉 *EMA9:* ${ind.ema9.toFixed(0)} | *EMA21:* ${ind.ema21.toFixed(0)}`,
            ``,
            `🎯 *TP1:* $${levels.tp1.toFixed(2)}`,
            `🎯 *TP2:* $${levels.tp2.toFixed(2)}`,
            `🛑 *SL:*  $${levels.sl.toFixed(2)}`,
            ``,
            `⏰ Session London active`,
        ].join('\n');
        await this.send(msg);
    }

    async tradeAlert(record) {
        const emoji = record.pnl >= 0 ? '✅' : '❌';
        const msg = [
            `${emoji} *TRADE FERMÉ* (${record.reason})`,
            ``,
            `📍 Entrée: $${record.entry.toFixed(2)} → Sortie: $${record.exit.toFixed(2)}`,
            `💰 *PnL: ${record.pnl >= 0 ? '+' : ''}${record.pnl} USDT*`,
            `🏦 Capital: $${record.capital}`,
            `⏱️ Durée: ${record.duration}s`,
        ].join('\n');
        await this.send(msg);
    }

    async statsAlert(stats) {
        const msg = [
            `📊 *STATS SESSION*`,
            ``,
            `Trades: ${stats.totalTrades} | ✅ ${stats.wins} / ❌ ${stats.losses}`,
            `Win Rate: ${stats.winRate} | R/R: ${stats.riskReward}`,
            `PnL Total: *${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl} USDT*`,
            `ROI: ${stats.roi} | Drawdown max: ${stats.maxDrawdown}`,
            `Capital: $${stats.capital}`,
        ].join('\n');
        await this.send(msg);
    }
}

module.exports = Telegram;
