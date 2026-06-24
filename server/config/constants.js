/**
 * @file constants.js
 * @description Centralized configuration constants for the AI Resume Analyzer.
 * All magic numbers, score weights, API URLs, and limits are defined here.
 */

module.exports = {
  // ATS Score category weights (must sum to 100)
  SCORE_WEIGHTS: {
    contact: 10,
    summary: 10,
    education: 10,
    skills: 15,
    projects: 20,
    experience: 15,
    certifications: 5,
    portfolio: 5,
    keywords: 5,
    formatting: 5
  },

  // File upload limits
  UPLOAD: {
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_EXTENSIONS: ['.pdf'],
    ALLOWED_MIME_TYPES: ['application/pdf']
  },

  // Request body limits
  BODY_LIMITS: {
    JSON_MAX_SIZE: '1mb',
    RESUME_TEXT_MAX_LENGTH: 50000  // characters
  },

  // Rate limiting configuration
  RATE_LIMITS: {
    upload: { windowMs: 5 * 60 * 1000, max: 5 },    // 5 uploads per 5 minutes
    general: { windowMs: 60 * 1000, max: 60 },       // 60 requests per minute
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000               // Purge expired entries every 5 min
  },

  // OpenRouter API configuration
  OPENROUTER: {
    URL: 'https://openrouter.ai/api/v1/chat/completions',
    MODEL_ID: process.env.OPENROUTER_MODEL_ID || 'nvidia/nemotron-3-ultra-550b-a55b',
    FALLBACK_MODEL_ID: process.env.OPENROUTER_FALLBACK_MODEL_ID || 'openrouter/free',
    MAX_RETRIES: 2,
    MAX_TOKENS: 800,
    TEMPERATURE: 0.3,
    REQUEST_TIMEOUT_MS: 15000,  // 15 second timeout per request
    BACKOFF_BASE_MS: 1500
  },

  // Server configuration
  SERVER: {
    REQUEST_TIMEOUT_MS: 120000,      // 2 minutes
    KEEP_ALIVE_TIMEOUT_MS: 65000,    // 65 seconds (must be > load balancer timeout)
    HEADERS_TIMEOUT_MS: 66000
  }
};
