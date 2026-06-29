/**
 * @file env.js
 * @description Centralized environment configuration and validation.
 */
require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'production';
const isDev = nodeEnv === 'development';
const isTest = nodeEnv === 'test' || nodeEnv === 'testing';

// Validate critical variables in production
if (!isDev && !isTest) {
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.trim().length === 0) {
    throw new Error('FATAL: OPENROUTER_API_KEY environment variable is required in production.');
  }

  if (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID.trim().length === 0) {
    throw new Error('FATAL: FIREBASE_PROJECT_ID environment variable is required in production.');
  }

  if (!process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL.trim().length === 0) {
    throw new Error('FATAL: FIREBASE_DATABASE_URL environment variable is required in production.');
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL.trim().length === 0) {
    throw new Error('FATAL: FIREBASE_CLIENT_EMAIL environment variable is required in production.');
  }

  if (!process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY.trim().length === 0) {
    throw new Error('FATAL: FIREBASE_PRIVATE_KEY environment variable is required in production.');
  }
}

// Private key needs to replace escaped \n sequences
let firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
if (firebasePrivateKey) {
  firebasePrivateKey = firebasePrivateKey.replace(/\\n/g, '\n');
}

// Validate port range
const rawPort = parseInt(process.env.PORT, 10);
const port = (!isNaN(rawPort) && rawPort > 0 && rawPort < 65536) ? rawPort : 5000;

// Validate client URL
let clientUrl = process.env.CLIENT_URL || 'http://localhost:5000';
if (clientUrl !== '*') {
  try {
    new URL(clientUrl);
  } catch (e) {
    console.warn(`[WARNING] CLIENT_URL "${clientUrl}" is not a valid URL. Falling back to default.`);
    clientUrl = 'http://localhost:5000';
  }
}

// Validate request timeout
const rawTimeout = parseInt(process.env.REQUEST_TIMEOUT, 10);
const requestTimeoutMs = (!isNaN(rawTimeout) && rawTimeout > 0) ? rawTimeout : 30000;

const config = {
  NODE_ENV: nodeEnv,
  IS_DEV: isDev,
  IS_TEST: isTest,
  PORT: port,
  CLIENT_URL: clientUrl,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  
  FIREBASE: {
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
    DATABASE_URL: process.env.FIREBASE_DATABASE_URL || '',
    CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
    PRIVATE_KEY: firebasePrivateKey || '',
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
  },
  
  ALLOW_MOCK_AUTH: process.env.ALLOW_MOCK_AUTH === 'true',
  VITE_ADMIN_EMAIL: process.env.VITE_ADMIN_EMAIL || 'admin@resumetrices.com',
  
  
  AI: {
    MODEL_ID: process.env.AI_MODEL || process.env.OPENROUTER_MODEL_ID || 'nvidia/nemotron-3-ultra-550b-a55b:free',
    FALLBACK_MODEL_ID: process.env.OPENROUTER_FALLBACK_MODEL_ID || 'openrouter/free',
    REQUEST_TIMEOUT_MS: requestTimeoutMs,
    MAX_AI_RETRIES: parseInt(process.env.MAX_AI_RETRIES, 10) || 1
  },
  
  UPLOAD: {
    MAX_FILE_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || (5 * 1024 * 1024)
  },
  
  LOG_LEVEL: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  DEBUG_MODE: process.env.DEBUG === 'true'
};

module.exports = config;
