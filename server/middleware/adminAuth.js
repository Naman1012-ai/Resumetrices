/**
 * @file adminAuth.js
 * @description Middleware to enforce admin role checks based on the VITE_ADMIN_EMAIL env variable.
 * Restricts access to users whose email matches the admin email.
 */

const { getAuth } = require('firebase-admin/auth');
const { isInitialized } = require('../services/firebaseService');
const logger = require('../utils/logger');
const env = require('../config/env');

const requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const isDevMode = env.IS_DEV;
  const allowMockAuth = env.ALLOW_MOCK_AUTH;
  const adminEmail = env.VITE_ADMIN_EMAIL;

  // 1. Development mock admin verification
  if (env.IS_DEV === true && env.ALLOW_MOCK_AUTH === true) {
    if (authHeader && authHeader.startsWith('Bearer mock-token')) {
      logger.warn('AdminAuth', '⚠️ Bypassing admin authentication check (mock-token detected in dev mode).');
      req.user = { uid: 'mock-admin-uid', email: adminEmail };
      return next();
    }
  }

  // Check if Firebase admin is initialized
  if (!isInitialized()) {
    logger.error('AdminAuth', 'Authentication system is not initialized.');
    return res.status(500).json({ success: false, message: 'Authentication system is not initialized.' });
  }

  try {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No authentication token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);

    // Validate admin claim (via custom claim or fallback email check)
    const isAdminClaim = decodedToken.admin === true;
    const isAdminEmail = decodedToken.email === adminEmail;
    if (!isAdminClaim && !isAdminEmail) {
      logger.warn('AdminAuth', `Access denied: User ${decodedToken.email} is not authorized as admin.`);
      return res.status(403).json({ success: false, message: 'Access denied. Administrative privilege required.' });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    logger.error('AdminAuth', `Admin verification failed: ${error.message}`);
    return res.status(401).json({ success: false, message: 'Authentication failed. Invalid token.' });
  }
};

module.exports = requireAdmin;
