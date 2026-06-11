const config = require('../config');
const logger  = require('./logger');

class RiskManager {
    constructor(initialCapital) {
        this.capital      = initialCapital || config.capital;
        this.initialCap   = this.capital;
        this.position     = null;      // trade en cours
        this.tradeCount   = 0;
        this.sessionPnl   = 0;
        this.history      = [];
        this.maxDrawdown  = 0;
        this.peakCapital  = this.capital;

        // Circuit breakers
        this.maxDailyLoss = config.capital * 0.05;   // 5% perte max/jour
        this.paused       = false;
    }

    hasPosition()  { return this.position !== null; }
    canTrade()     {
        if (this.paused) return false;
        if (this.tradeCount >= config.maxTradesPerSession) {
            logger.warn(`Limite de trades atteinte (${config.maxTradesPerSession})`);
            return false;
        }
        if (this.sessionPnl < -this.maxDailyLoss) {
            logger.warn('Circuit breaker: perte journalière max atteinte');
            this.paused = true;
            return false;
        }
        return true;
    }

    openPosition({ side, entry, sl, tp1, tp2, size, orderId }) {
        if (this.hasPosition()) return false;
        this.position = {
            side, entry, sl, tp1, tp2, size, orderId,
            openTime: Date.now(),
            tp1Hit: false,
        };
        this.tradeCount++;
        logger.info(`Position ouverte: ${side} @ ${entry.toFixed(2)} | SL: ${sl.toFixed(2)} | TP1: ${tp1.toFixed(2)} | TP2: ${tp2.toFixed(2)} | Taille: ${size}`);
        return true;
    }

    // Vérification SL/TP sur prix courant — retourne l'action à faire
    checkExits(currentPrice) {
        if (!this.hasPosition()) return null;
        const { side, sl, tp1, tp2, tp1Hit } = this.position;

        if (side === 'BUY') {
            if (currentPrice <= sl)            return 'SL';
            if (!tp1Hit && currentPrice >= tp1) return 'TP1';
            if (tp1Hit && currentPrice >= tp2)  return 'TP2';
        } else {
            if (currentPrice >= sl)             return 'SL';
            if (!tp1Hit && currentPrice <= tp1) return 'TP1';
            if (tp1Hit && currentPrice <= tp2)  return 'TP2';
        }
        return null;
    }

    // Trailing stop: déplace SL au breakeven après TP1
    applyTrailing(currentPrice) {
        if (!this.hasPosition() || this.position.tp1Hit) return;
        const { side, entry, tp1 } = this.position;

        if (side === 'BUY' && currentPrice >= tp1) {
            this.position.tp1Hit = true;
            this.position.sl = entry; // SL au breakeven
            logger.info(`Trailing: TP1 atteint → SL déplacé au breakeven (${entry.toFixed(2)})`);
        }
        if (side === 'SELL' && currentPrice <= tp1) {
            this.position.tp1Hit = true;
            this.position.sl = entry;
            logger.info(`Trailing: TP1 atteint → SL déplacé au breakeven (${entry.toFixed(2)})`);
        }
    }

    closePosition(exitPrice, reason) {
        if (!this.hasPosition()) return null;
        const { side, entry, size, openTime } = this.position;

        const rawPnl = side === 'BUY'
            ? (exitPrice - entry) * size
            : (entry - exitPrice) * size;

        const fee  = exitPrice * size * 0.001;  // 0.1% frais taker
        const pnl  = rawPnl - fee;

        this.capital    += pnl;
        this.sessionPnl += pnl;

        // Mise à jour drawdown
        if (this.capital > this.peakCapital) this.peakCapital = this.capital;
        const dd = ((this.peakCapital - this.capital) / this.peakCapital) * 100;
        if (dd > this.maxDrawdown) this.maxDrawdown = dd;

        const record = {
            side, entry, exit: exitPrice,
            size, pnl: parseFloat(pnl.toFixed(2)),
            reason,
            duration: Math.round((Date.now() - openTime) / 1000),
            capital: parseFloat(this.capital.toFixed(2)),
        };

        this.history.push(record);
        this.position = null;

        const emoji = pnl >= 0 ? '✅' : '❌';
        logger.info(`${emoji} Position fermée (${reason}): PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT | Capital: ${this.capital.toFixed(2)}`);
        return record;
    }

    getStats() {
        const wins    = this.history.filter(t => t.pnl > 0);
        const losses  = this.history.filter(t => t.pnl < 0);
        const totalPnl = this.history.reduce((s, t) => s + t.pnl, 0);
        const winRate  = this.history.length > 0 ? (wins.length / this.history.length * 100).toFixed(1) : 0;
        const avgWin   = wins.length > 0   ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
        const avgLoss  = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
        const rr       = avgLoss !== 0 ? Math.abs(avgWin / avgLoss).toFixed(2) : 'N/A';

        return {
            totalTrades:  this.history.length,
            wins:         wins.length,
            losses:       losses.length,
            winRate:      `${winRate}%`,
            totalPnl:     totalPnl.toFixed(2),
            avgWin:       avgWin.toFixed(2),
            avgLoss:      avgLoss.toFixed(2),
            riskReward:   rr,
            maxDrawdown:  `${this.maxDrawdown.toFixed(2)}%`,
            capital:      this.capital.toFixed(2),
            roi:          `${((this.capital - this.initialCap) / this.initialCap * 100).toFixed(2)}%`,
        };
    }
}

module.exports = RiskManager;
