# 🤖 BTC Scalping Bot

Bot de trading automatisé pour le scalping BTC/USD sur timeframe 1 minute.

## 📁 Structure

```
trading-bot/
├── config/
│   └── index.js          # Chargeur de config (.env)
├── src/
│   ├── index.js          # 🚀 Point d'entrée principal
│   ├── exchange.js       # Connecteur CCXT (Binance, Kraken, OKX…)
│   ├── indicators.js     # EMA 9/21/50, RSI, MACD, ATR, BB
│   ├── score.js          # Moteur de scoring + signaux
│   ├── risk.js           # Gestion du risque, TP/SL, position sizing
│   ├── session.js        # Filtre sessions London/NY/Tokyo
│   ├── telegram.js       # Alertes Telegram
│   ├── logger.js         # Logs console + fichiers
│   └── backtest.js       # Backtesting sur données historiques
├── logs/                 # Fichiers de log (auto-créés)
├── .env.example          # Template de configuration
└── package.json
```

## ⚡ Installation

```bash
# 1. Cloner / copier le dossier
cd trading-bot

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# → Éditer .env avec vos clés API
```

## 🚀 Utilisation

```bash
# Mode Paper Trading (simulation — RECOMMANDÉ pour débuter)
npm run paper

# Mode Live (trading réel — attention !)
# → Mettre PAPER_TRADING=false dans .env
npm start

# Backtest sur données simulées
npm run backtest
```

## 📊 Indicateurs utilisés

| Indicateur | Paramètre | Rôle |
|-----------|-----------|------|
| EMA 9     | rapide    | Tendance court terme |
| EMA 21    | moyen     | Tendance moyen terme |
| EMA 50    | lent      | Filtre tendance (visible sur chart) |
| RSI 14    | —         | Momentum, zones survente/surachat |
| MACD      | 12/26/9   | Confirmation direction |
| ATR 14    | —         | Volatilité, sizing SL/TP |

## 🎯 Logique de signal

```
Score ≥ 60 + EMA9 > EMA21 > EMA50 + RSI < 60 + Session active
→ Signal BUY

Score ≥ 60 + EMA9 < EMA21 < EMA50 + RSI > 40 + Session active
→ Signal SELL
```

## 🛡️ Gestion du risque

- **Risk par trade**: 1.5% du capital
- **Stop Loss**: 1× ATR sous l'entrée
- **TP1**: 1.5× ATR (trailing stop activé)
- **TP2**: 3× ATR
- **Max 5 trades/session**
- **Circuit breaker**: arrêt si perte > 5% journalière

## 📱 Alertes Telegram

1. Créer un bot via @BotFather
2. Copier le token dans `.env`
3. Obtenir votre Chat ID via @userinfobot
4. Mettre `TELEGRAM_ALERTS=true`

## ⚠️ Disclaimer

Ce bot est fourni à titre éducatif. Le trading de cryptomonnaies comporte
des risques importants. Testez toujours en **paper trading** avant tout
déploiement réel. Ne risquez jamais plus que ce que vous pouvez vous
permettre de perdre.
