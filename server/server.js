/**
 * @file server.js
 * @description Entry point for the AI Resume Analyzer server application.
 * Imports the Express application, sets server timeouts, and configures
 * graceful shutdown behavior and error logging.
 */

// Load environment variables from .env file
require('dotenv').config();

const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const constants = require('./config/constants');

// Retrieve configurations
const PORT = env.PORT;
const NODE_ENV = env.NODE_ENV;

// Start HTTP server
const server = app.listen(PORT, () => {
  logger.info('Server', `🚀 Resumetrices Server Started!`);
  logger.info('Server', `📢 Mode: ${NODE_ENV}`);
  logger.info('Server', `🌐 Server running on: http://localhost:${PORT}`);
});

// Set server timeouts for performance and protection against slowloris/stale connections
server.timeout = constants.SERVER.REQUEST_TIMEOUT_MS;
server.keepAliveTimeout = constants.SERVER.KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = constants.SERVER.HEADERS_TIMEOUT_MS;

/**
 * Handles graceful shutdown by stopping acceptance of new requests
 * and exiting after outstanding connections terminate.
 */
const gracefulShutdown = (signal) => {
  logger.warn('Server', `Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('Server', 'HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force exit if connections don't close in 10 seconds
  setTimeout(() => {
    logger.error('Server', 'Forced shutdown initiated due to pending connections.');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Server', `💥 Unhandled Promise Rejection: ${err.message}`, {
    stack: err.stack
  });
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Server', `💥 Uncaught Exception: ${err.message}`, {
    stack: err.stack
  });
  process.exit(1);
});
