/**
 * @file constants.js
 * @description Centralized configuration constants for the AI Resume Analyzer.
 * All magic numbers, score weights, API URLs, and limits are defined here.
 */

const env = require('./env');

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
    MAX_FILE_SIZE: env.UPLOAD.MAX_FILE_SIZE,
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
    MODEL_ID: env.AI.MODEL_ID,
    FALLBACK_MODEL_ID: env.AI.FALLBACK_MODEL_ID,
    MAX_RETRIES: env.AI.MAX_AI_RETRIES,
    MAX_TOKENS: 600,
    TEMPERATURE: 0.1,
    TOP_P: 0.8,
    FREQUENCY_PENALTY: 0,
    PRESENCE_PENALTY: 0,
    REQUEST_TIMEOUT_MS: env.AI.REQUEST_TIMEOUT_MS,  // timeout per request from environment
    PRIMARY_TIMEOUT_MS: 15000,      // 15 seconds for the primary model attempt
    FALLBACK_TIMEOUT_MS: 8000,       // 8 seconds for each fallback model attempt
    FALLBACK_DELAY_MS: 500,         // 500ms delay between fallback attempts
    BACKOFF_BASE_MS: 1500,
    FALLBACK_MODELS: [
      'meta-llama/llama-3.3-70b-instruct:free',   // 131K context, strong general
      'openai/gpt-oss-120b:free',                  // 131K context, OpenAI open weight
      'openai/gpt-oss-20b:free',                   // 131K context, lighter/faster
      'nvidia/nemotron-3-super-120b-a12b:free',    // 1M context, smaller nemotron
      'nvidia/nemotron-nano-9b-v2:free',           // 128K context, fast fallback
      'nousresearch/hermes-3-llama-3.1-405b:free', // 131K context
      'meta-llama/llama-3.2-3b-instruct:free',     // 131K context, fastest fallback
    ].filter(Boolean),
    ALL_MODELS: [...new Set([
      process.env.OPENROUTER_MODEL_ID || env.AI.MODEL_ID,
      'meta-llama/llama-3.3-70b-instruct:free',
      'openai/gpt-oss-120b:free',
      'openai/gpt-oss-20b:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'nvidia/nemotron-nano-9b-v2:free',
      'nousresearch/hermes-3-llama-3.1-405b:free',
      'meta-llama/llama-3.2-3b-instruct:free',
      'openrouter/free'
    ])].filter(Boolean)
  },

  // Server configuration
  SERVER: {
    REQUEST_TIMEOUT_MS: 120000,      // 2 minutes
    KEEP_ALIVE_TIMEOUT_MS: 65000,    // 65 seconds (must be > load balancer timeout)
    HEADERS_TIMEOUT_MS: 66000
  }
};
