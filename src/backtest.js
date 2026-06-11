require('dotenv').config();
const Indicators  = require('./indicators');
const { getScore, getSignal, getLevels, getPositionSize } = require('./score');
const RiskManager = require('./risk');
const config      = require('../config');

// ─── BACKTEST SUR DONNÉES HISTORIQUES ─────────────────────────────────────────
// Utilise des données OHLCV réelles (CSV ou générées)

async function runBacktest(candles) {
    console.log('\n🔄 Démarrage du backtest...\n');

    const indEngine = new Indicators();
    const risk      = new RiskManager(config.capital);
    let   tradeCount = 0;

    for (let i = 60; i < candles.length; i++) {
        const slice = candles.slice(0, i + 1);
        const ind   = indEngine.compute(slice);
        if (!ind) continue;

        const regime   = indEngine.detectRegime(ind);
        const breakout = indEngine.detectBreakout(slice);
        const score    = getScore(ind, regime, breakout);
        const signal   = getSignal(score, ind, regime, breakout);

        // ── Position ouverte: check exits ──
        if (risk.hasPosition()) {
            risk.applyTrailing(ind.last);
            const exit = risk.checkExits(ind.last);
            if (exit || signal === 'EXIT') {
                risk.closePosition(ind.last, exit || 'SIGNAL');
            }
            continue;
        }

        // ── Nouvelle position ──
        if (!risk.canTrade()) continue;
        if (signal !== 'BUY' && signal !== 'SELL') continue;

        const levels = getLevels(ind.last, signal, ind.atr);
        const size   = getPositionSize(risk.capital, levels.entry, levels.sl);
        if (size <= 0) continue;

        risk.openPosition({
            side: signal, entry: ind.last,
            sl: levels.sl, tp1: levels.tp1, tp2: levels.tp2,
            size, orderId: `BT_${i}`,
        });
        tradeCount++;
    }

    // Fermer position ouverte à la fin
    if (risk.hasPosition()) {
        const last = candles[candles.length - 1].close;
        risk.closePosition(last, 'END_OF_DATA');
    }

    // ── Résultats ──
    const stats = risk.getStats();
    console.log('╔══════════════════════════════════════════╗');
    console.log('║          RÉSULTATS BACKTEST              ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║ Trades totaux   : ${String(stats.totalTrades).padEnd(22)}║`);
    console.log(`║ Gagnants        : ${String(stats.wins).padEnd(22)}║`);
    console.log(`║ Perdants        : ${String(stats.losses).padEnd(22)}║`);
    console.log(`║ Win Rate        : ${String(stats.winRate).padEnd(22)}║`);
    console.log(`║ Risk/Reward     : ${String(stats.riskReward).padEnd(22)}║`);
    console.log(`║ PnL Total       : ${String(stats.totalPnl + ' USDT').padEnd(22)}║`);
    console.log(`║ ROI             : ${String(stats.roi).padEnd(22)}║`);
    console.log(`║ Drawdown max    : ${String(stats.maxDrawdown).padEnd(22)}║`);
    console.log(`║ Capital final   : ${String('$' + stats.capital).padEnd(22)}║`);
    console.log('╚══════════════════════════════════════════╝');

    return stats;
}

// ─── GÉNÉRATION DE DONNÉES TEST ───────────────────────────────────────────────
function generateTestCandles(n = 500, startPrice = 73650) {
    const candles = [];
    let price = startPrice;
    const now = Date.now();
    for (let i = 0; i < n; i++) {
        const phase      = Math.floor(i / 60) % 4;
        const trendDir   = phase < 2 ? 1 : -1;
        const isTrend    = phase % 2 === 0;
        const trendForce = isTrend ? trendDir * 25 : 0;
        const volatility = 80 + Math.random() * 200;
        const noise      = (Math.random() - 0.5) * volatility;
        const change     = trendForce + noise;
        const open  = price;
        const close = price + change;
        const wick  = volatility * 0.3;
        const high  = Math.max(open, close) + Math.random() * wick;
        const low   = Math.min(open, close) - Math.random() * wick;
        candles.push({ timestamp: now + i * 60000, open, high, low, close, volume: 1 + Math.random() * 3 });
        price = close;
    }
    return candles;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
console.log('📊 Génération de 500 bougies BTC/USD simulées...');
const testCandles = generateTestCandles(500, 73650);
runBacktest(testCandles).catch(console.error);
