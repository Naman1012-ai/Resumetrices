/**
 * @file auth.js
 * @description Authentication middleware that verifies Firebase ID tokens.
 * Restricts access to authenticated users and handles mock authentication for local development securely.
 */

const { getAuth } = require('firebase-admin/auth');
const { isInitialized, hasCredentials } = require('../services/firebaseService');
const logger = require('../utils/logger');

/**
 * Express middleware to verify Firebase ID tokens passed in the Authorization header.
 */
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const isDevMode = process.env.NODE_ENV === 'development';
  const allowMockAuth = process.env.ALLOW_MOCK_AUTH === 'true';

  // 1. Mock token authentication bypass (only allowed in explicit development environments)
  if (authHeader && authHeader.startsWith('Bearer mock-token') && isDevMode && allowMockAuth) {
    const tokenSuffix = authHeader.substring('Bearer mock-token'.length).replace(/^-/, '');
    const uid = tokenSuffix ? `mock-uid-${tokenSuffix}` : 'anonymous-local-dev-uid';
    const email = tokenSuffix ? `${tokenSuffix}@mock.local` : 'dev@local.local';
    
    logger.warn('Auth', `⚠️ Bypassing authentication check (mock-token detected for UID: ${uid} in development mode).`);
    req.user = { uid, email };
    return next();
  }

  // 2. Unauthenticated local fallback bypass (only allowed in explicit development environments without credentials)
  if (isDevMode && !authHeader && (!isInitialized() || (typeof hasCredentials === 'function' && !hasCredentials()))) {
    logger.warn('Auth', '⚠️ Bypassing authentication check (running in unauthenticated local development fallback mode).');
    req.user = { uid: 'anonymous-local-dev-uid', email: 'dev@local.local' };
    return next();
  }

  // If Firebase Admin is not initialized and we are not in development bypass, fail fast
  if (!isInitialized()) {
    logger.error('Auth', 'Authentication system is not initialized.');
    const error = new Error('Authentication system is not initialized.');
    error.statusCode = 500;
    error.code = 'AUTH_UNINITIALIZED';
    return next(error);
  }

  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error = new Error('Access denied. No authentication token provided.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    // Extract Firebase ID token
    const token = authHeader.split(' ')[1];
    
    // Verify token using Firebase Admin SDK
    const decodedToken = await getAuth().verifyIdToken(token);
    
    // Attach decoded user info to request object
    req.user = decodedToken;
    next();
  } catch (error) {
    logger.error('Auth', `Authentication failed: ${error.message}`, { errorCode: error.code });
    
    const authError = new Error(`Authentication failed: ${error.message}`);
    authError.statusCode = 401;
    
    // Pass Firebase specific token error codes (e.g. auth/id-token-expired)
    if (error.code) {
      authError.code = error.code;
    } else {
      authError.code = 'AUTH_FAILED';
    }
    
    return next(authError);
  }
};

module.exports = requireAuth;
