require('dotenv').config();

module.exports = {
    exchange: process.env.EXCHANGE || 'binance',
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,

    symbol: process.env.SYMBOL || 'BTC/USDT',
    timeframe: process.env.TIMEFRAME || '1m',
    paperTrading: process.env.PAPER_TRADING !== 'false',

    capital: parseFloat(process.env.CAPITAL) || 1000,
    riskPerTrade: parseFloat(process.env.RISK_PER_TRADE) || 1.5,
    maxTradesPerSession: parseInt(process.env.MAX_TRADES_PER_SESSION) || 5,
    stopLossPct: parseFloat(process.env.STOP_LOSS_PCT) || 0.4,
    tp1Pct: parseFloat(process.env.TAKE_PROFIT_1_PCT) || 0.6,
    tp2Pct: parseFloat(process.env.TAKE_PROFIT_2_PCT) || 1.2,

    emaFast: parseInt(process.env.EMA_FAST) || 9,
    emaSlow: parseInt(process.env.EMA_SLOW) || 21,
    emaTrend: parseInt(process.env.EMA_TREND) || 50,
    rsiPeriod: parseInt(process.env.RSI_PERIOD) || 14,
    macdFast: parseInt(process.env.MACD_FAST) || 12,
    macdSlow: parseInt(process.env.MACD_SLOW) || 26,
    macdSignal: parseInt(process.env.MACD_SIGNAL) || 9,
    atrPeriod: parseInt(process.env.ATR_PERIOD) || 14,

    telegramToken: process.env.TELEGRAM_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    telegramAlerts: process.env.TELEGRAM_ALERTS === 'true',
};
