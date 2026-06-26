/**
 * @file firebaseService.js
 * @description Service layer for interacting with Firebase services via the Firebase Admin SDK.
 * Initializes Firebase, validates database connection, and provides helper functions to read and write records.
 */

const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');
const logger = require('../utils/logger');

const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

let isFirebaseInitialized = false;
let hasCredentials = false;
const mockDatabaseStore = new Map();


// Validate configuration on startup
if (!projectId || !databaseURL) {
  logger.warn('Firebase', '⚠️ Missing FIREBASE_PROJECT_ID or FIREBASE_DATABASE_URL environment variables. Running in localized offline fallback mode.');
}

try {
  if (!admin.getApps().length) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.applicationDefault(),
        databaseURL: databaseURL
      });
      logger.info('Firebase', '🛡️ Firebase Admin SDK initialized using Application Default Credentials (ADC)');
      isFirebaseInitialized = true;
      hasCredentials = true;
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.cert({
          projectId: projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        databaseURL: databaseURL
      });
      logger.info('Firebase', '🛡️ Firebase Admin SDK initialized using environment variable credentials');
      isFirebaseInitialized = true;
      hasCredentials = true;
    } else {
      // In development mode, allow initializing with just the project ID (offline/emulator mode or fallback)
      admin.initializeApp({
        projectId: projectId || 'fallback-dev-project',
        databaseURL: databaseURL
      });
      logger.warn('Firebase', '⚠️ Firebase credentials not configured. Running in unauthenticated fallback mode.');
      isFirebaseInitialized = true;
      hasCredentials = false;
    }
  } else {
    isFirebaseInitialized = true;
    hasCredentials = true;
  }
} catch (error) {
  logger.error('Firebase', `❌ Failed to initialize Firebase Admin SDK: ${error.message}`);
  isFirebaseInitialized = false;
  hasCredentials = false;
}

// Perform asynchronous database connectivity test on startup if database URL is present and initialized
if (isFirebaseInitialized && hasCredentials && databaseURL) {
  const db = getDatabase();
  db.ref('.info/connected').once('value')
    .then((snapshot) => {
      const connected = snapshot.val();
      if (connected) {
        logger.info('Firebase', '🔌 Realtime Database connectivity verified successfully.');
      } else {
        logger.warn('Firebase', '⚠️ Realtime Database connection is established but currently offline.');
      }
    })
    .catch((err) => {
      logger.error('Firebase', `⚠️ Realtime Database connectivity check failed: ${err.message}`);
    });
}

/**
 * Saves a parsed resume analysis record to the Realtime Database.
 * Saves under the global path and under the user's specific history path.
 * @param {string} analysisId - Unique generated ID of the analysis.
 * @param {object} record - Object containing resume metadata and analysis results.
 * @returns {Promise<boolean>}
 */
const saveAnalysis = async (analysisId, record) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized. Cannot write to database.');
  }

  // Data validation before writing to DB
  if (!analysisId || typeof analysisId !== 'string') {
    throw new Error('Database Validation Error: analysisId must be a non-empty string.');
  }
  if (!record || typeof record !== 'object') {
    throw new Error('Database Validation Error: record must be a valid object.');
  }
  const userId = record.userId || 'anonymous';
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }

  // Construct payload with required and validated schema
  const dbPayload = {
    analysisId: analysisId,
    userId: userId,
    targetRole: record.targetRole || '',
    resumeText: record.resumeText || record.extractedResumeText || record.extractedText || '',
    resumeName: record.resumeName || 'Untitled Resume',
    resumeFileName: record.resumeFileName || record.resumeName || 'Untitled Resume',
    score: record.score || 0,
    atsScore: record.atsScore || record.score || 0,
    breakdown: record.breakdown || {},
    explanations: record.explanations || {},
    strengths: record.strengths || [],
    weaknesses: record.weaknesses || [],
    recommendations: record.recommendations || [],
    atsTips: record.atsTips || [],
    rewriteSuggestions: record.rewriteSuggestions || [],
    missingKeywords: record.missingKeywords || [],
    missingSections: record.missingSections || [],
    recruiterFeedback: record.recruiterFeedback || '',
    skillGap: record.skillGap || null,
    interviewPrep: record.interviewPrep || null,
    extractedText: record.extractedText || '',
    extractedResumeText: record.extractedResumeText || record.extractedText || '',
    detectedSkills: record.detectedSkills || [],
    createdAt: record.createdAt || new Date().toISOString()
  };

  // If in fallback mode without real credentials, write to in-memory store
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Saving analysis ${analysisId} to local in-memory store.`);
    mockDatabaseStore.set(analysisId, dbPayload);
    if (!mockDatabaseStore.has(`user_${userId}`)) {
      mockDatabaseStore.set(`user_${userId}`, new Map());
    }
    mockDatabaseStore.get(`user_${userId}`).set(analysisId, dbPayload);
    return true;
  }

  try {
    const db = getDatabase();
    // Save to global analyses repository
    await db.ref(`analyses/${analysisId}`).set(dbPayload);
    // Save to user history repository (with summary fields + details for instant loading)
    await db.ref(`users/${userId}/analyses/${analysisId}`).set(dbPayload);
    logger.info('Firebase', `💾 Analysis ${analysisId} successfully saved to Firebase RTDB for user ${userId}.`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Firebase Database Write Failed: ${error.message}`, { analysisId, userId });
    throw new Error(`Firebase Database Write Failed: ${error.message}`);
  }
};

/**
 * Fetches all past analysis summaries/records for a given user ID.
 * @param {string} userId - User's Firebase UID.
 * @returns {Promise<object[]>} - Array of analysis objects, sorted by date (newest first).
 */
const getUserHistory = async (userId) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }

  // If in fallback mode without real credentials, return from local in-memory store
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Reading history for user ${userId} from local in-memory store.`);
    const userMap = mockDatabaseStore.get(`user_${userId}`);
    if (!userMap) return [];
    const list = Array.from(userMap.values());
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  try {
    const db = getDatabase();
    const snapshot = await db.ref(`users/${userId}/analyses`).once('value');
    const data = snapshot.val();
    if (!data) return [];
    
    // Convert object of objects into an array
    const list = Object.keys(data).map(key => data[key]);
    
    // Sort by createdAt descending
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    logger.error('Firebase', `Firebase Database Read Failed: ${error.message}`, { userId });
    throw new Error(`Firebase Database Read Failed: ${error.message}`);
  }
};

/**
 * Fetches a single analysis record by its unique ID.
 * @param {string} analysisId - Unique generated ID of the analysis.
 * @returns {Promise<object|null>} - Analysis record or null if not found.
 */
const getAnalysisById = async (analysisId) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!analysisId || typeof analysisId !== 'string') {
    throw new Error('Database Validation Error: analysisId must be a non-empty string.');
  }

  // If in fallback mode without real credentials, return from local in-memory store
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Reading analysis ${analysisId} from local in-memory store.`);
    return mockDatabaseStore.get(analysisId) || null;
  }

  try {
    const db = getDatabase();
    const snapshot = await db.ref(`analyses/${analysisId}`).once('value');
    return snapshot.val();
  } catch (error) {
    logger.error('Firebase', `Firebase Database Read Failed: ${error.message}`, { analysisId });
    throw new Error(`Firebase Database Read Failed: ${error.message}`);
  }
};

/**
 * Retrieves aggregate statistics and recent analysis summaries for a user dashboard.
 * @param {string} userId - User's Firebase UID.
 * @returns {Promise<object>} - Dashboard stats object.
 */
const getDashboardStats = async (userId) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }

  // If in fallback mode without real credentials, calculate from local in-memory store
  if (!hasCredentials) {
    logger.warn('Firebase', '⚠️ Running in fallback mode. Calculating stats from local in-memory store.');
    const userMap = mockDatabaseStore.get(`user_${userId}`);
    if (!userMap) {
      return {
        totalAnalyses: 0,
        highestScore: 0,
        averageScore: 0,
        analysesThisMonth: 0,
        recentAnalysis: null,
        trends: []
      };
    }
    const list = Array.from(userMap.values());
    const sortedList = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const totalAnalyses = sortedList.length;
    const highestScore = totalAnalyses > 0 ? Math.max(...sortedList.map(item => item.score)) : 0;
    const sumScore = sortedList.reduce((sum, item) => sum + item.score, 0);
    const averageScore = totalAnalyses > 0 ? Math.round(sumScore / totalAnalyses) : 0;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const analysesThisMonth = sortedList.filter(item => {
      const d = new Date(item.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    
    const recentAnalysis = sortedList[0] || null;
    
    const trends = sortedList.slice(0, 6).reverse().map(item => ({
      name: item.resumeName,
      score: item.score,
      date: new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
    }));

    return {
      totalAnalyses,
      highestScore,
      averageScore,
      analysesThisMonth,
      recentAnalysis,
      trends
    };
  }

  try {
    const db = getDatabase();
    const snapshot = await db.ref(`users/${userId}/analyses`).once('value');
    const data = snapshot.val();
    
    if (!data) {
      return {
        totalAnalyses: 0,
        highestScore: 0,
        averageScore: 0,
        analysesThisMonth: 0,
        recentAnalysis: null,
        trends: []
      };
    }

    const list = Object.keys(data).map(key => data[key]);
    
    // Sort by createdAt descending
    const sortedList = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const totalAnalyses = sortedList.length;
    const highestScore = totalAnalyses > 0 ? Math.max(...sortedList.map(item => item.score)) : 0;
    const sumScore = sortedList.reduce((sum, item) => sum + item.score, 0);
    const averageScore = totalAnalyses > 0 ? Math.round(sumScore / totalAnalyses) : 0;
    
    // Analyses this month (current calendar month & year)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const analysesThisMonth = sortedList.filter(item => {
      const d = new Date(item.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    
    const recentAnalysis = sortedList[0] || null;
    
    // Last 6 iterations in chronological order for the trend chart
    const trends = sortedList.slice(0, 6).reverse().map(item => ({
      name: item.resumeName,
      score: item.score,
      date: new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
    }));

    return {
      totalAnalyses,
      highestScore,
      averageScore,
      analysesThisMonth,
      recentAnalysis,
      trends
    };
  } catch (error) {
    logger.error('Firebase', `Firebase Database Stats Retrieval Failed: ${error.message}`, { userId });
    throw new Error(`Firebase Database Stats Retrieval Failed: ${error.message}`);
  }
};

/**
 * Deletes a single analysis record from both global and user-specific history.
 * @param {string} analysisId - Unique generated ID of the analysis.
 * @param {string} userId - User's Firebase UID.
 * @returns {Promise<boolean>}
 */
const deleteAnalysis = async (analysisId, userId) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!analysisId || typeof analysisId !== 'string') {
    throw new Error('Database Validation Error: analysisId must be a non-empty string.');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }

  // If in fallback mode without real credentials, delete from local in-memory store
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Deleting analysis ${analysisId} from local in-memory store.`);
    mockDatabaseStore.delete(analysisId);
    const userMap = mockDatabaseStore.get(`user_${userId}`);
    if (userMap) userMap.delete(analysisId);
    return true;
  }

  try {
    const db = getDatabase();
    
    // Remove from user history
    await db.ref(`users/${userId}/analyses/${analysisId}`).remove();
    
    // Remove from global analyses repository
    await db.ref(`analyses/${analysisId}`).remove();
    
    logger.info('Firebase', `🗑️ Analysis ${analysisId} successfully deleted from Firebase RTDB for user ${userId}.`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Firebase Database Delete Failed: ${error.message}`, { analysisId, userId });
    throw new Error(`Firebase Database Delete Failed: ${error.message}`);
  }
};

module.exports = {
  saveAnalysis,
  getUserHistory,
  getAnalysisById,
  getDashboardStats,
  deleteAnalysis,
  isInitialized: () => isFirebaseInitialized,
  hasCredentials: () => hasCredentials
};
