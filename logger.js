const winston = require('winston');

const fmt = winston.format;

const consoleFormat = fmt.combine(
    fmt.timestamp({ format: 'HH:mm:ss' }),
    fmt.printf(({ timestamp, level, message }) => {
        const colors = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' };
        const reset = '\x1b[0m';
        const c = colors[level] || '';
        return `${'\x1b[90m'}[${timestamp}]${reset} ${c}${level.toUpperCase().padEnd(5)}${reset} ${message}`;
    })
);

// Railway: stdout uniquement (pas de fichiers — filesystem éphémère)
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
    ],
});

module.exports = logger;
