/**
 * @file rateLimiter.js
 * @description In-memory sliding-window rate limiting middleware.
 * Uses req.ip (secured with trust proxy) to prevent abuse and includes periodic memory cleanup.
 */

const constants = require('../config/constants');
const logger = require('../utils/logger');

const { RATE_LIMITS } = constants;

const store = {
  upload: new Map(),
  general: new Map()
};

// Periodic memory cleanup to purge expired client IP entries from the Maps
setInterval(() => {
  const now = Date.now();
  
  for (const type of ['upload', 'general']) {
    const map = store[type];
    const config = RATE_LIMITS[type];
    let purgedCount = 0;

    for (const [ip, timestamps] of map.entries()) {
      // Filter timestamps within the current window
      const validTimestamps = timestamps.filter(time => now - time < config.windowMs);
      
      if (validTimestamps.length === 0) {
        // Safe to remove the IP from map entirely to free memory
        map.delete(ip);
        purgedCount++;
      } else {
        map.set(ip, validTimestamps);
      }
    }

    if (purgedCount > 0) {
      logger.debug('RateLimiter', `Purged ${purgedCount} expired rate-limiter entries for '${type}' store.`);
    }
  }
}, RATE_LIMITS.CLEANUP_INTERVAL_MS).unref(); // Use unref() so the interval does not block application exit

/**
 * Creates an Express middleware for rate-limiting.
 * @param {'upload'|'general'} type - Rate limit configuration type.
 * @returns {Function} - Express middleware function.
 */
const rateLimiter = (type = 'general') => {
  const config = RATE_LIMITS[type] || RATE_LIMITS.general;
  const map = store[type] || store.general;
  
  return (req, res, next) => {
    // Extract client IP (req.ip is secure since trust proxy is configured in app.js)
    const ip = req.ip || 'unknown';
    const now = Date.now();
    
    if (!map.has(ip)) {
      map.set(ip, []);
    }
    
    let timestamps = map.get(ip);
    
    // Filter timestamps within the current sliding window
    timestamps = timestamps.filter(time => now - time < config.windowMs);
    
    if (timestamps.length >= config.max) {
      logger.warn('RateLimiter', `Rate limit exceeded for IP: ${ip} on store: ${type}`);
      const error = new Error('Too many requests. Please try again later.');
      error.statusCode = 429;
      return next(error);
    }
    
    // Record request timestamp
    timestamps.push(now);
    map.set(ip, timestamps);
    
    // Add rate limit metadata headers
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', config.max - timestamps.length);
    res.setHeader('X-RateLimit-Reset', new Date(now + config.windowMs).toISOString());
    
    next();
  };
};

module.exports = rateLimiter;
