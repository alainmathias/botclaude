const config = require('../config');

// Poids dynamiques — peuvent être ajustés via backtest
function getWeights() {
    return {
        rsi:      25,
        macd:     20,
        breakout: 30,
        ema:      15,
        momentum: 10,
    };
}

// ─── SCORE ────────────────────────────────────────────────────────────────────
function getScore(ind, regime, breakout) {
    const weights = getWeights();
    let score = 0;
    const { rsi, ema9, ema21, ema50, macd, atrPct, momentum, last } = ind;

    // RSI — seuils progressifs (FIX: 30/70 trop extrêmes sur 1min)
    if (rsi < 40 || rsi > 60) score += weights.rsi;
    if (rsi < 30 || rsi > 70) score += weights.rsi * 0.5;  // bonus extrême

    // EMA — alignement court + moyen terme (FIX: EMA 50 intégrée)
    if (ema9 > ema21)  score += 12;
    if (last > ema50)  score += 10;
    if (ema9 > ema50)  score += 8;

    // MACD
    if (macd.MACD > macd.signal)        score += weights.macd;
    if (macd.histogram > 0)             score += 5;

    // ATR — relatif au prix (FIX: seuil absolu remplacé par %)
    if (atrPct > 0.08) score += 15;
    if (atrPct > 0.15) score += 5;

    // Breakout (FIX: BEAR_BREAKOUT utilisait score fixe 35 → weights.breakout)
    if (breakout === 'BULL_BREAKOUT') score += weights.breakout;
    if (breakout === 'BEAR_BREAKOUT') score += weights.breakout;
    if (breakout === 'NONE')          score -= 10;

    // Momentum — progressif (FIX: 0.15% trop haut → 0.05% micro-mvt)
    if (Math.abs(momentum) > 0.05) score += 10;
    if (Math.abs(momentum) > 0.15) score += 8;

    // Bonus régime tendanciel
    if (regime === 'TREND_UP' || regime === 'TREND_DOWN') score += 10;

    return Math.max(0, Math.min(score, 100));
}

// ─── SIGNAL ───────────────────────────────────────────────────────────────────
function getSignal(score, ind, regime, breakout) {
    const { rsi, ema9, ema21, ema50 } = ind;

    // Zone morte réduite (FIX: 45–55 → 48–52)
    if (rsi > 48 && rsi < 52) return 'NONE';

    // ── BUY ──
    if (
        score >= 60 &&
        ema9 > ema21 &&
        ema9 > ema50 &&            // filtre tendance moyen terme
        rsi < 60 &&
        rsi > 30 &&                // évite RSI oversold extrême
        regime !== 'RANGE' &&
        (breakout === 'BULL_BREAKOUT' || breakout === 'NONE')
    ) {
        return 'BUY';
    }

    // ── SELL ──
    if (
        score >= 60 &&
        ema9 < ema21 &&
        ema9 < ema50 &&
        rsi > 40 &&
        rsi < 70 &&
        regime !== 'RANGE' &&
        (breakout === 'BEAR_BREAKOUT' || breakout === 'NONE')
    ) {
        return 'SELL';
    }

    // ── EXIT ──
    if (score >= 50 && ema9 < ema21 && rsi > 50) return 'EXIT';

    // ── RANGE MODE ──
    if (regime === 'RANGE') {
        if (rsi < 35 && ema9 > ema21) return 'BUY';
        if (rsi > 65 && ema9 < ema21) return 'EXIT';
    }

    return 'NONE';
}

// ─── NIVEAUX TP/SL ────────────────────────────────────────────────────────────
function getLevels(entry, side, atr) {
    // SL/TP basés sur l'ATR pour s'adapter à la volatilité
    const atrMult = { sl: 1.0, tp1: 1.5, tp2: 3.0 };

    if (side === 'BUY') {
        return {
            entry,
            sl:  entry - atr * atrMult.sl,
            tp1: entry + atr * atrMult.tp1,
            tp2: entry + atr * atrMult.tp2,
        };
    } else {
        return {
            entry,
            sl:  entry + atr * atrMult.sl,
            tp1: entry - atr * atrMult.tp1,
            tp2: entry - atr * atrMult.tp2,
        };
    }
}

// ─── TAILLE DE POSITION ───────────────────────────────────────────────────────
function getPositionSize(capital, entry, sl) {
    const riskAmount  = capital * (config.riskPerTrade / 100);
    const riskPerUnit = Math.abs(entry - sl);
    if (riskPerUnit === 0) return 0;
    return parseFloat((riskAmount / riskPerUnit).toFixed(6));
}

module.exports = { getScore, getSignal, getLevels, getPositionSize, getWeights };
