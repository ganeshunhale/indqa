import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import config from '../config/index.js';

/**
 * Shared application logger.
 *
 * Lives in its own module (rather than app.js) so services/middleware can import
 * it without creating a circular dependency on the server entry point.
 *
 * Log files rotate daily and are size-capped so they never grow unbounded
 * (the previous setup wrote to a single ever-growing error.log / combined.log).
 */

const { combine, timestamp, json, simple, colorize } = winston.format;

const fileRotateTransport = (filename, level) =>
  new DailyRotateFile({
    filename: `logs/${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxSize: '5m',
    maxFiles: '14d',
    level,
    format: combine(timestamp(), json()),
  });

// In test mode, log to a single silent console transport so the test runner
// output stays clean and no log files are written to disk.
const isTest = config.nodeEnv === 'test';

const logger = winston.createLogger({
  level: isTest ? 'error' : config.isProduction ? 'info' : 'debug',
  silent: isTest,
  format: combine(timestamp(), json()),
  transports: isTest
    ? [new winston.transports.Console({ format: simple() })]
    : [
        new winston.transports.Console({ format: combine(colorize(), simple()) }),
        fileRotateTransport('error', 'error'),
        fileRotateTransport('combined'),
      ],
});

export default logger;
