const winston = require('winston');
const path = require('path');

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

const fileFormat = fmt.combine(
    fmt.timestamp(),
    fmt.json()
);

const logger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/bot.log'),
            format: fileFormat,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
        }),
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/errors.log'),
            level: 'error',
            format: fileFormat,
        }),
    ],
});

module.exports = logger;
