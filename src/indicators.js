const ti = require('technicalindicators');
const config = require('../config');

class Indicators {
    // Calcule tous les indicateurs depuis un tableau de bougies
    compute(candles) {
        const closes = candles.map(c => c.close);
        const highs  = candles.map(c => c.high);
        const lows   = candles.map(c => c.low);

        const emaFast = this._ema(closes, config.emaFast);
        const emaSlow = this._ema(closes, config.emaSlow);
        const emaTrend = this._ema(closes, config.emaTrend);
        const rsiArr   = this._rsi(closes, config.rsiPeriod);
        const macdObj  = this._macd(closes);
        const atrArr   = this._atr(highs, lows, closes, config.atrPeriod);
        const bbObj    = this._bb(closes);

        if (!emaFast || !emaSlow || !emaTrend || !rsiArr || !macdObj || !atrArr) {
            return null;
        }

        const last = closes[closes.length - 1];
        const prev = closes[closes.length - 2];

        return {
            ema9:  emaFast[emaFast.length - 1],
            ema21: emaSlow[emaSlow.length - 1],
            ema50: emaTrend[emaTrend.length - 1],
            rsi:   rsiArr[rsiArr.length - 1],
            macd: {
                MACD:       macdObj.MACD[macdObj.MACD.length - 1],
                signal:     macdObj.signal[macdObj.signal.length - 1],
                histogram:  macdObj.histogram[macdObj.histogram.length - 1],
            },
            atr:  atrArr[atrArr.length - 1],
            atrPct: (atrArr[atrArr.length - 1] / last) * 100,
            bb:   bbObj ? {
                upper: bbObj.upper[bbObj.upper.length - 1],
                middle: bbObj.middle[bbObj.middle.length - 1],
                lower: bbObj.lower[bbObj.lower.length - 1],
            } : null,
            closes,
            last,
            prev,
            momentum: ((last - prev) / prev) * 100,
        };
    }

    // Détecte le régime de marché (TREND_UP / TREND_DOWN / RANGE)
    detectRegime(ind) {
        const { ema9, ema21, ema50, last, rsi } = ind;
        const spread = Math.abs(ema9 - ema21) / ema21 * 100;

        if (spread < 0.02) return 'RANGE';
        if (ema9 > ema21 && ema21 > ema50 && last > ema50) return 'TREND_UP';
        if (ema9 < ema21 && ema21 < ema50 && last < ema50) return 'TREND_DOWN';
        return 'RANGE';
    }

    // Détecte un breakout sur les N dernières bougies
    detectBreakout(candles, lookback = 20) {
        if (candles.length < lookback + 1) return 'NONE';

        const recent   = candles.slice(-lookback - 1, -1);
        const highZone = Math.max(...recent.map(c => c.high));
        const lowZone  = Math.min(...recent.map(c => c.low));
        const last     = candles[candles.length - 1];

        if (last.close > highZone) return 'BULL_BREAKOUT';
        if (last.close < lowZone)  return 'BEAR_BREAKOUT';
        return 'NONE';
    }

    _ema(closes, period) {
        try {
            return ti.EMA.calculate({ period, values: closes });
        } catch { return null; }
    }

    _rsi(closes, period) {
        try {
            return ti.RSI.calculate({ period, values: closes });
        } catch { return null; }
    }

    _macd(closes) {
        try {
            const result = ti.MACD.calculate({
                values: closes,
                fastPeriod: config.macdFast,
                slowPeriod: config.macdSlow,
                signalPeriod: config.macdSignal,
                SimpleMAOscillator: false,
                SimpleMASignal: false,
            });
            const MACD      = result.map(r => r.MACD);
            const signal    = result.map(r => r.signal);
            const histogram = result.map(r => r.histogram);
            return { MACD, signal, histogram };
        } catch { return null; }
    }

    _atr(highs, lows, closes, period) {
        try {
            return ti.ATR.calculate({ high: highs, low: lows, close: closes, period });
        } catch { return null; }
    }

    _bb(closes, period = 20, stdDev = 2) {
        try {
            const result = ti.BollingerBands.calculate({ period, values: closes, stdDev });
            return {
                upper:  result.map(r => r.upper),
                middle: result.map(r => r.middle),
                lower:  result.map(r => r.lower),
            };
        } catch { return null; }
    }
}

module.exports = Indicators;
