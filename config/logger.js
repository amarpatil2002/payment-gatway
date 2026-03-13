const winston = require("winston");
const path = require("path");

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        return `${timestamp} [${level.toUpperCase()}] : ${stack || message}`;
    })
);

const logger = winston.createLogger({
    level: "info",
    format: logFormat,
    transports: [
        new winston.transports.Console(),

        new winston.transports.File({
            filename: path.join(__dirname, "../logs/error.log"),
            level: "error",
        }),

        new winston.transports.File({
            filename: path.join(__dirname, "../logs/app.log"),
        }),
    ],
});

module.exports = logger;