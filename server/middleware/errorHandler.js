/**
 * @file errorHandler.js
 * @description Centralized Express error-handling middleware.
 * Sanitizes stack traces in production, handles Multer, Firebase, and OpenRouter errors,
 * and ensures consistent JSON response formatting.
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const nodeEnv = process.env.NODE_ENV || 'production';

  // Log error using our structured logger
  logger.error('API', `Error occurred: ${err.message}`, {
    stack: nodeEnv === 'development' ? err.stack : undefined,
    path: req.originalUrl,
    method: req.method,
    statusCode,
    errorCode
  });

  // Handle Multer-specific upload errors
  if (err.name === 'MulterError') {
    let message = 'File upload error.';
    let code = 'UPLOAD_ERROR';
    let status = 400;

    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size is too large. Max allowed size is 5MB.';
      code = 'FILE_TOO_LARGE';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field. Ensure field name is "resume".';
      code = 'INVALID_FIELD';
    }

    return res.status(status).json({
      status: 'error',
      code,
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Firebase specific authentication/database errors
  if (err.code && err.code.startsWith('auth/')) {
    let message = 'Authentication error.';
    let status = 401;

    if (err.code === 'auth/id-token-expired') {
      message = 'Authentication token has expired. Please log in again.';
    } else if (err.code === 'auth/argument-error') {
      message = 'Invalid authentication token format.';
    }

    return res.status(status).json({
      status: 'error',
      code: err.code.toUpperCase().replace(/\//g, '_'),
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Rate Limiter errors
  if (statusCode === 429) {
    return res.status(429).json({
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: err.message || 'Too many requests. Please try again later.',
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  res.status(statusCode).json({
    status: 'error',
    code: errorCode,
    message: err.message || 'An internal server error occurred.',
    // Return stack trace only in local development
    ...(nodeEnv === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;
