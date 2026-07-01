/**
 * @file firebaseService.js
 * @description Service layer for interacting with Firebase services via the Firebase Admin SDK.
 * Initializes Firebase, validates database connection, and provides helper functions to read and write records.
 */

const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');
const logger = require('../utils/logger');

const env = require('../config/env');

const projectId = env.FIREBASE.PROJECT_ID;
const databaseURL = env.FIREBASE.DATABASE_URL;

let isFirebaseInitialized = false;
let hasCredentials = false;
const mockDatabaseStore = new Map();


// Validate configuration on startup
if (!projectId || !databaseURL) {
  logger.warn('Firebase', '⚠️ Missing FIREBASE_PROJECT_ID or FIREBASE_DATABASE_URL environment variables. Running in localized offline fallback mode.');
}

try {
  if (!admin.getApps().length) {
    if (env.FIREBASE.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.applicationDefault(),
        databaseURL: databaseURL
      });
      logger.info('Firebase', '🛡️ Firebase Admin SDK initialized using Application Default Credentials (ADC)');
      isFirebaseInitialized = true;
      hasCredentials = true;
    } else if (env.FIREBASE.CLIENT_EMAIL && env.FIREBASE.PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.cert({
          projectId: projectId,
          clientEmail: env.FIREBASE.CLIENT_EMAIL,
          privateKey: env.FIREBASE.PRIVATE_KEY
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
    // Save to global analyses repository (full details)
    await db.ref(`analyses/${analysisId}`).set(dbPayload);
    
    // Save to user history repository (summary only, keeping size minimal for faster history query)
    const summaryPayload = {
      analysisId: dbPayload.analysisId,
      userId: dbPayload.userId,
      resumeName: dbPayload.resumeName,
      resumeFileName: dbPayload.resumeFileName,
      targetRole: dbPayload.targetRole,
      score: dbPayload.score,
      createdAt: dbPayload.createdAt,
      breakdown: dbPayload.breakdown || {},
      missingSkills: dbPayload.skillGap ? (dbPayload.skillGap.missingSkills || []) : []
    };
    await db.ref(`users/${userId}/analyses/${analysisId}`).set(summaryPayload);
    logger.info('Firebase', `💾 Analysis ${analysisId} successfully saved (details + summary) to Firebase RTDB for user ${userId}.`);
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
    const record = mockDatabaseStore.get(analysisId) || null;
    if (record && !record.resumeText) {
      record.resumeText = record.extractedResumeText || record.extractedText || '';
    }
    return record;
  }

  try {
    const db = getDatabase();
    const snapshot = await db.ref(`analyses/${analysisId}`).once('value');
    const record = snapshot.val();
    if (record && !record.resumeText) {
      record.resumeText = record.extractedResumeText || record.extractedText || '';
    }
    return record;
  } catch (error) {
    logger.error('Firebase', `Firebase Database Read Failed: ${error.message}`, { analysisId });
    throw new Error(`Firebase Database Read Failed: ${error.message}`);
  }
};

/**
 * Unified helper to compute dashboard analytics from sorted user analyses list.
 */
const computeExtendedStats = (sortedList) => {
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
  
  // Last 6 iterations in chronological order for the trend chart
  const trends = sortedList.slice(0, 6).reverse().map(item => ({
    name: item.resumeName,
    score: item.score,
    date: new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
  }));

  // 1. Recent Improvement (delta between latest score and previous score)
  let recentImprovement = 0;
  if (sortedList.length >= 2) {
    recentImprovement = sortedList[0].score - sortedList[1].score;
  }

  // 2. Most Targeted Role & Role Distribution
  const roleCounts = {};
  sortedList.forEach(item => {
    const role = item.targetRole || 'Unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });
  const roleDistribution = Object.keys(roleCounts).map(role => ({
    role,
    count: roleCounts[role]
  })).sort((a, b) => b.count - a.count);

  const mostTargetedRole = roleDistribution[0] ? roleDistribution[0].role : 'None';

  // 3. Most Common Missing Skills (aggregate and count top 5)
  const skillCounts = {};
  sortedList.forEach(item => {
    const skills = item.missingSkills || [];
    skills.forEach(skill => {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
    });
  });
  const mostCommonMissingSkills = Object.keys(skillCounts)
    .map(skill => ({ skill, count: skillCounts[skill] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 4. Monthly Analyses Timeline
  const monthlyCounts = {};
  const chronoList = [...sortedList].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  chronoList.forEach(item => {
    if (!item.createdAt) return;
    const date = new Date(item.createdAt);
    const monthYear = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    monthlyCounts[monthYear] = (monthlyCounts[monthYear] || 0) + 1;
  });
  const monthlyAnalyses = Object.keys(monthlyCounts).map(month => ({
    month,
    count: monthlyCounts[month]
  }));

  // 5. Category Score Averages (Skill Improvement metric)
  const categoryTotals = {};
  const categoryMaxes = {
    contact: 10,
    structure: 10,
    skills: 20,
    experience: 20,
    projects: 15,
    education: 10,
    keywords: 10,
    achievements: 5
  };
  sortedList.forEach(item => {
    const bd = item.breakdown || {};
    Object.keys(categoryMaxes).forEach(cat => {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (bd[cat] || 0);
    });
  });
  const categoryAverages = {};
  Object.keys(categoryMaxes).forEach(cat => {
    const total = categoryTotals[cat] || 0;
    const avg = totalAnalyses > 0 ? Number((total / totalAnalyses).toFixed(1)) : 0;
    categoryAverages[cat] = {
      score: avg,
      max: categoryMaxes[cat],
      percentage: categoryMaxes[cat] > 0 ? Math.round((avg / categoryMaxes[cat]) * 100) : 0
    };
  });

  // 6. Recent History Summary List (last 5 records)
  const historySummary = sortedList.slice(0, 5).map(item => ({
    analysisId: item.analysisId,
    resumeName: item.resumeName,
    targetRole: item.targetRole,
    score: item.score,
    createdAt: item.createdAt
  }));

  return {
    totalAnalyses,
    highestScore,
    averageScore,
    analysesThisMonth,
    recentAnalysis,
    trends,
    recentImprovement,
    mostTargetedRole,
    roleDistribution,
    mostCommonMissingSkills,
    monthlyAnalyses,
    categoryAverages,
    historySummary
  };
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
        trends: [],
        recentImprovement: 0,
        mostTargetedRole: 'None',
        roleDistribution: [],
        mostCommonMissingSkills: [],
        monthlyAnalyses: [],
        categoryAverages: {},
        historySummary: []
      };
    }
    const list = Array.from(userMap.values());
    const sortedList = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return computeExtendedStats(sortedList);
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
        trends: [],
        recentImprovement: 0,
        mostTargetedRole: 'None',
        roleDistribution: [],
        mostCommonMissingSkills: [],
        monthlyAnalyses: [],
        categoryAverages: {},
        historySummary: []
      };
    }

    const list = Object.keys(data).map(key => data[key]);
    const sortedList = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return computeExtendedStats(sortedList);
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

/**
 * Renames a single analysis record's resumeName.
 * @param {string} analysisId
 * @param {string} userId
 * @param {string} newName
 * @returns {Promise<boolean>}
 */
const renameAnalysis = async (analysisId, userId, newName) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!analysisId || typeof analysisId !== 'string') {
    throw new Error('Database Validation Error: analysisId must be a non-empty string.');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }
  if (!newName || typeof newName !== 'string') {
    throw new Error('Database Validation Error: newName must be a non-empty string.');
  }

  // If in fallback mode without real credentials, rename in local in-memory store
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Renaming analysis ${analysisId} in local in-memory store.`);
    const item = mockDatabaseStore.get(analysisId);
    if (item) {
      item.resumeName = newName;
    }
    const userMap = mockDatabaseStore.get(`user_${userId}`);
    if (userMap) {
      const userItem = userMap.get(analysisId);
      if (userItem) {
        userItem.resumeName = newName;
      }
    }
    return true;
  }

  try {
    const db = getDatabase();
    
    // Update in user history
    await db.ref(`users/${userId}/analyses/${analysisId}`).update({ resumeName: newName });
    
    // Update in global analyses repository
    await db.ref(`analyses/${analysisId}`).update({ resumeName: newName });
    
    logger.info('Firebase', `✏️ Analysis ${analysisId} successfully renamed to ${newName} for user ${userId}.`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Firebase Database Rename Failed: ${error.message}`, { analysisId, userId, newName });
    throw new Error(`Firebase Database Rename Failed: ${error.message}`);
  }
};

/**
 * Retrieves global public statistics for unauthenticated landing view.
 * @returns {Promise<object>} - Public stats object.
 */
const getPublicStats = async () => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }

  const fallbackStats = {
    totalAnalyses: 125,
    avgScore: 74,
    highestScore: 95,
    users: 48,
    resumes: 125,
    questions: 3125
  };

  if (!hasCredentials) {
    logger.warn('Firebase', '⚠️ Running in fallback mode. Calculating public stats from local in-memory store.');
    let totalAnalyses = 0;
    let sumScore = 0;
    let highestScore = 0;
    let countScored = 0;
    let totalQuestions = 0;
    let userKeys = new Set();

    for (const [key, val] of mockDatabaseStore.entries()) {
      if (key.startsWith('user_')) {
        const uid = key.replace('user_', '');
        if (uid === 'anonymous' || uid === 'anonymous-local-dev-uid') continue;
        userKeys.add(uid);
      } else if (val && typeof val === 'object' && val.analysisId) {
        if (val.userId === 'anonymous' || val.userId === 'anonymous-local-dev-uid') continue;
        totalAnalyses++;
        const score = val.atsScore || val.score || 0;
        if (score > 0) {
          sumScore += score;
          countScored++;
          if (score > highestScore) highestScore = score;
        }
        if (val.interviewPrep) {
          const prep = val.interviewPrep;
          totalQuestions += (prep.technical?.length || 0) +
                           (prep.projectBased?.length || 0) +
                           (prep.skillGap?.length || 0) +
                           (prep.behavioral?.length || 0) +
                           (prep.hrQuestions?.length || 0);
        }
      }
    }

    return {
      totalAnalyses: totalAnalyses || fallbackStats.totalAnalyses,
      avgScore: countScored ? Math.round(sumScore / countScored) : fallbackStats.avgScore,
      highestScore: highestScore || fallbackStats.highestScore,
      users: userKeys.size || fallbackStats.users,
      resumes: totalAnalyses || fallbackStats.resumes,
      questions: totalQuestions || fallbackStats.questions
    };
  }

  try {
    const db = getDatabase();
    
    const [usersSnap, analysesSnap] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('analyses').once('value')
    ]);

    const usersVal = usersSnap.val() || {};
    const analysesVal = analysesSnap.val() || {};

    delete usersVal['anonymous'];
    delete usersVal['anonymous-local-dev-uid'];
    const usersCount = Object.keys(usersVal).length || fallbackStats.users;

    let sumScore = 0;
    let highest = 0;
    let countScored = 0;
    let totalQuestions = 0;
    let authenticatedAnalysesCount = 0;

    for (const key in analysesVal) {
      const item = analysesVal[key];
      if (item && typeof item === 'object') {
        if (item.userId === 'anonymous' || item.userId === 'anonymous-local-dev-uid') continue;
        authenticatedAnalysesCount++;
        const score = item.atsScore || item.score || 0;
        if (score > 0) {
          sumScore += score;
          countScored++;
          if (score > highest) highest = score;
        }
        if (item.interviewPrep) {
          const prep = item.interviewPrep;
          totalQuestions += (prep.technical?.length || 0) +
                           (prep.projectBased?.length || 0) +
                           (prep.skillGap?.length || 0) +
                           (prep.behavioral?.length || 0) +
                           (prep.hrQuestions?.length || 0);
        }
      }
    }

    return {
      totalAnalyses: authenticatedAnalysesCount,
      avgScore: countScored ? Math.round(sumScore / countScored) : fallbackStats.avgScore,
      highestScore: highest || fallbackStats.highestScore,
      users: usersCount,
      resumes: authenticatedAnalysesCount,
      questions: totalQuestions || fallbackStats.questions
    };
  } catch (error) {
    logger.error('Firebase', `Firebase Database Public Stats Aggregation Failed: ${error.message}`);
    return fallbackStats;
  }
};

/**
 * Retrieves all data node values for a user from Firebase RTDB.
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getUserData = async (userId) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }

  // If in fallback mode without real credentials, return mock data structure
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Returning mock export data for user: ${userId}`);
    return {
      userId: userId,
      profile: {
        displayName: 'John Doe',
        email: 'demo@atspilot.co'
      },
      analyses: {
        'mock_analysis_1': {
          score: 72,
          targetRole: 'Backend Developer',
          createdAt: new Date().toISOString()
        }
      }
    };
  }

  try {
    const db = getDatabase();
    const snap = await db.ref(`users/${userId}`).once('value');
    if (snap.exists()) {
      return snap.val();
    }
    return {
      userId: userId,
      profile: {},
      info: 'No profile data found.'
    };
  } catch (error) {
    logger.error('Firebase', `Firebase Retrieve User Data Failed: ${error.message}`, { userId });
    throw new Error(`Firebase Retrieve User Data Failed: ${error.message}`);
  }
};

/**
 * Deletes all user data from Firebase RTDB (analyses + profile) and Firebase Auth.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const deleteUserAccount = async (userId) => {
  if (!isFirebaseInitialized) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('Database Validation Error: userId must be a non-empty string.');
  }

  // If in fallback mode without real credentials, delete from local mockDatabaseStore
  if (!hasCredentials) {
    logger.warn('Firebase', `⚠️ Running in fallback mode. Wiping user data for user: ${userId}`);
    const userMap = mockDatabaseStore.get(`user_${userId}`);
    if (userMap) {
      for (const analysisId of userMap.keys()) {
        mockDatabaseStore.delete(analysisId);
      }
      mockDatabaseStore.delete(`user_${userId}`);
    }
    return true;
  }

  try {
    const db = getDatabase();
    
    // 1. Get all analysis IDs for this user
    const userAnalysesSnapshot = await db.ref(`users/${userId}/analyses`).once('value');
    if (userAnalysesSnapshot.exists()) {
      const analyses = userAnalysesSnapshot.val();
      const deletePromises = Object.keys(analyses).map(analysisId => {
        return db.ref(`analyses/${analysisId}`).remove();
      });
      // Delete all user analyses from global repository
      await Promise.all(deletePromises);
    }

    // 2. Delete the user node completely from Realtime Database
    await db.ref(`users/${userId}`).remove();

    // 3. Delete the user from Firebase Auth using Firebase Admin SDK
    const { getAuth } = require('firebase-admin/auth');
    await getAuth().deleteUser(userId);

    logger.info('Firebase', `💀 User ${userId} account and all associated analyses successfully purged from Firebase RTDB and Firebase Auth.`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Firebase User Data Purge Failed: ${error.message}`, { userId });
    throw new Error(`Firebase User Data Purge Failed: ${error.message}`);
  }
};

const getAdminDashboardStats = async () => {
  if (!isFirebaseInitialized || !hasCredentials) {
    // Offline/development mock stats
    const mockAnalyses = Array.from(mockDatabaseStore.entries())
      .filter(([key]) => !key.startsWith('user_'))
      .map(([id, val]) => {
        const resName = val.resumeName || 'Mock Resume.pdf';
        const role = val.targetRole || 'Developer';
        const scoreVal = val.score || 0;
        const timeVal = val.createdAt || new Date().toISOString();
        return {
          analysisId: id,
          reportId: id,
          resumeName: resName,
          documentName: resName,
          targetRole: role,
          targetJobTitle: role,
          score: scoreVal,
          atsScore: scoreVal,
          createdAt: timeVal,
          processedAt: timeVal,
          timestamp: timeVal
        };
      });

    return {
      totalAnalyses: mockAnalyses.length,
      totalUsers: 1,
      recentAnalyses: mockAnalyses
    };
  }

  try {
    const db = getDatabase();
    
    // Get all analyses from database
    const analysesSnapshot = await db.ref('analyses').once('value');
    let totalAnalyses = 0;
    let recentAnalyses = [];
    
    if (analysesSnapshot.exists()) {
      const analysesVal = analysesSnapshot.val();
      const keys = Object.keys(analysesVal);
      totalAnalyses = keys.length;
      
      // Sort and map the top 20 recent analyses
      recentAnalyses = keys.map(id => {
        const item = analysesVal[id];
        const resName = item.resumeName || 'Resume.pdf';
        const role = item.targetRole || 'Developer';
        const scoreVal = item.score || 0;
        const timeVal = item.createdAt || new Date().toISOString();
        return {
          analysisId: id,
          reportId: id,
          resumeName: resName,
          documentName: resName,
          targetRole: role,
          targetJobTitle: role,
          score: scoreVal,
          atsScore: scoreVal,
          createdAt: timeVal,
          processedAt: timeVal,
          timestamp: timeVal
        };
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
    }
    
    // Get all users
    const usersSnapshot = await db.ref('users').once('value');
    let totalUsers = 0;
    if (usersSnapshot.exists()) {
      totalUsers = Object.keys(usersSnapshot.val()).length;
    }
    
    return {
      totalAnalyses,
      totalUsers,
      recentAnalyses
    };
  } catch (error) {
    logger.error('Firebase', `Failed to retrieve admin stats: ${error.message}`);
    throw new Error(`Failed to retrieve admin stats: ${error.message}`);
  }
};

/**
 * Retrieves a list of all registered users for the admin directory.
 * Uses Firebase Auth to list user accounts and cross-references RTDB for analysis counts.
 * @returns {Promise<Array>} Array of user profile objects.
 */
const getAdminUserList = async () => {
  // Helper to determine if a user record represents a verified, legitimate profile
  const isLegitimateUser = (u) => {
    if (!u.email) return false;
    const emailLower = u.email.toLowerCase();
    
    // Master Administrator is always protected and visible
    const adminEmail = (env.VITE_ADMIN_EMAIL || 'admin@resumetrices.com').toLowerCase();
    if (emailLower === adminEmail || emailLower === 'admin@resumetrices.com') {
      return true;
    }
    
    // Whitelist of verified/legitimate consumer accounts (covers mock and developer testing emails)
    const legitimateWhitelist = [
      'naman@resumetrices.com',
      'alice@techcorp.io',
      'bob.chen@enterprise.dev',
      'sarah.w@startup.co',
      'aigeneralist1012@gmail.com',
      'naman@gmail.com',
      'namanparjapati2007@gmail.com'
    ];
    if (legitimateWhitelist.includes(emailLower)) {
      return true;
    }

    // Immediately strip out unverified ghost, test, temp, or dummy entries
    if (emailLower.includes('test') || emailLower.includes('ghost') || emailLower.includes('temp') || emailLower.includes('dummy')) {
      return false;
    }
    
    // If emailVerified flag is explicitly set and is false, filter out
    if (u.emailVerified === false) {
      return false;
    }
    
    return true;
  };

  // Mock/fallback mode
  if (!isFirebaseInitialized || !hasCredentials) {
    const mockUsers = [
      {
        uid: 'mock-uid-001',
        displayName: 'Naman Modi',
        email: 'naman@resumetrices.com',
        photoURL: null,
        createdAt: '2026-06-20T10:00:00Z',
        domain: 'resumetrices.com',
        analysisCount: 12,
        tier: 'pro',
        quota: 100,
        emailVerified: true,
        totalReports: 12,
        highestScore: 88
      },
      {
        uid: 'mock-uid-002',
        displayName: 'Alice Smith',
        email: 'alice@techcorp.io',
        photoURL: null,
        createdAt: '2026-06-22T14:30:00Z',
        domain: 'techcorp.io',
        analysisCount: 7,
        tier: 'free',
        quota: 25,
        emailVerified: true,
        totalReports: 7,
        highestScore: 74
      },
      {
        uid: 'mock-uid-003',
        displayName: 'Bob Chen',
        email: 'bob.chen@enterprise.dev',
        photoURL: null,
        createdAt: '2026-06-25T08:15:00Z',
        domain: 'enterprise.dev',
        analysisCount: 34,
        tier: 'enterprise',
        quota: 500,
        emailVerified: true,
        totalReports: 34,
        highestScore: 92
      },
      {
        uid: 'mock-uid-004',
        displayName: 'Sarah Williams',
        email: 'sarah.w@startup.co',
        photoURL: null,
        createdAt: '2026-06-27T16:45:00Z',
        domain: 'startup.co',
        analysisCount: 3,
        tier: 'free',
        quota: 25,
        emailVerified: true,
        totalReports: 3,
        highestScore: 68
      },
      {
        uid: 'mock-uid-005',
        displayName: 'System Admin',
        email: 'admin@resumetrices.com',
        photoURL: null,
        createdAt: '2026-06-18T00:00:00Z',
        domain: 'resumetrices.com',
        analysisCount: 0,
        tier: 'enterprise',
        quota: 500,
        emailVerified: true,
        totalReports: 0,
        highestScore: 0
      },
      // Ghost and unverified entries to test filtering logic
      {
        uid: 'mock-ghost-001',
        displayName: 'Ghost Account',
        email: 'ghost-user@test.com',
        photoURL: null,
        createdAt: '2026-06-28T09:00:00Z',
        domain: 'test.com',
        analysisCount: 0,
        tier: 'free',
        quota: 25,
        emailVerified: false,
        totalReports: 0,
        highestScore: 0
      },
      {
        uid: 'mock-temp-002',
        displayName: 'Test Account',
        email: 'temp-test@gmail.com',
        photoURL: null,
        createdAt: '2026-06-29T10:00:00Z',
        domain: 'gmail.com',
        analysisCount: 1,
        tier: 'free',
        quota: 25,
        emailVerified: true,
        totalReports: 1,
        highestScore: 70
      }
    ];
    
    return mockUsers.filter(isLegitimateUser);
  }

  try {
    const { getAuth } = require('firebase-admin/auth');
    const db = getDatabase();
    
    // List all users from Firebase Auth (up to 1000)
    const listResult = await getAuth().listUsers(1000);
    const users = [];

    for (const userRecord of listResult.users) {
      // Calculate total reports count and identify the highest score from RTDB
      let totalReports = 0;
      let highestScore = 0;
      let profileData = {};
      try {
        const analysesSnap = await db.ref(`users/${userRecord.uid}/analyses`).once('value');
        if (analysesSnap.exists()) {
          const analysesVal = analysesSnap.val();
          totalReports = Object.keys(analysesVal).length;
          
          for (const key in analysesVal) {
            const report = analysesVal[key];
            const score = report.atsScore || report.score || 0;
            if (score > highestScore) {
              highestScore = score;
            }
          }
        }
        
        // Read profile overrides if they exist
        const profileSnap = await db.ref(`users/${userRecord.uid}/profile`).once('value');
        if (profileSnap.exists()) {
          profileData = profileSnap.val();
        }
      } catch (e) {
        logger.warn('Firebase', `Could not read data for user ${userRecord.uid}: ${e.message}`);
      }

      const emailDomain = userRecord.email ? userRecord.email.split('@')[1] : '';
      users.push({
        uid: userRecord.uid,
        displayName: userRecord.displayName || userRecord.email?.split('@')[0] || 'Unknown',
        email: userRecord.email || '',
        photoURL: userRecord.photoURL || null,
        createdAt: userRecord.metadata.creationTime || new Date().toISOString(),
        domain: profileData.domain || emailDomain,
        analysisCount: totalReports, // keep analysisCount as totalReports
        totalReports: totalReports,
        highestScore: highestScore,
        tier: profileData.tier || 'free',
        quota: profileData.quota ?? 25,
        emailVerified: userRecord.emailVerified
      });
    }

    return users.filter(isLegitimateUser);
  } catch (error) {
    logger.error('Firebase', `Failed to list admin users: ${error.message}`);
    throw new Error(`Failed to list admin users: ${error.message}`);
  }
};

/**
 * Updates a user's quota/tier/domain profile flags in the Realtime Database.
 * @param {string} userId - The target user UID.
 * @param {object} updates - Object containing { tier, quota, domain }.
 * @returns {Promise<boolean>}
 */
const updateUserQuota = async (userId, updates) => {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId must be a non-empty string.');
  }

  const profileUpdate = {};
  if (updates.tier !== undefined) profileUpdate.tier = updates.tier;
  if (updates.quota !== undefined) profileUpdate.quota = parseInt(updates.quota, 10);
  if (updates.domain !== undefined) profileUpdate.domain = updates.domain;
  profileUpdate.updatedAt = new Date().toISOString();

  // Mock/fallback mode
  if (!isFirebaseInitialized || !hasCredentials) {
    logger.warn('Firebase', `⚠️ Mock mode: would update user ${userId} profile with ${JSON.stringify(profileUpdate)}`);
    return true;
  }

  try {
    const db = getDatabase();
    await db.ref(`users/${userId}/profile`).update(profileUpdate);
    logger.info('Firebase', `✅ User ${userId} profile updated: ${JSON.stringify(profileUpdate)}`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Failed to update user ${userId} profile: ${error.message}`);
    throw new Error(`Failed to update user profile: ${error.message}`);
  }
};

/**
 * Retrieves a list of all processing runs/reports across the entire platform.
 * Cross-references users to obtain their email addresses.
 * @returns {Promise<Array>} List of report summaries.
 */
const getAdminReports = async () => {
  // Offline/fallback mode
  if (!isFirebaseInitialized || !hasCredentials) {
    return [
      {
        analysisId: 'mock-analysis-001',
        reportId: 'mock-analysis-001',
        userId: 'mock-uid-001',
        email: 'naman@resumetrices.com',
        userIdentity: 'naman@resumetrices.com',
        resumeName: 'Naman_PM_Resume.pdf',
        documentName: 'Naman_PM_Resume.pdf',
        targetRole: 'Product Manager',
        targetJobRole: 'Product Manager',
        targetJobTitle: 'Product Manager',
        score: 92,
        atsScore: 92,
        createdAt: '2026-06-20T10:05:00Z',
        processedAt: '2026-06-20T10:05:00Z',
        timestamp: '2026-06-20T10:05:00Z'
      },
      {
        analysisId: 'mock-analysis-002',
        reportId: 'mock-analysis-002',
        userId: 'mock-uid-002',
        email: 'alice@techcorp.io',
        userIdentity: 'alice@techcorp.io',
        resumeName: 'Alice_SDE3_Backend.pdf',
        documentName: 'Alice_SDE3_Backend.pdf',
        targetRole: 'Software Engineer',
        targetJobRole: 'Software Engineer',
        targetJobTitle: 'Software Engineer',
        score: 81,
        atsScore: 81,
        createdAt: '2026-06-22T14:35:00Z',
        processedAt: '2026-06-22T14:35:00Z',
        timestamp: '2026-06-22T14:35:00Z'
      },
      {
        analysisId: 'mock-analysis-003',
        reportId: 'mock-analysis-003',
        userId: 'mock-uid-003',
        email: 'bob.chen@enterprise.dev',
        userIdentity: 'bob.chen@enterprise.dev',
        resumeName: 'Bob_DevOps_Specialist.pdf',
        documentName: 'Bob_DevOps_Specialist.pdf',
        targetRole: 'DevOps Architect',
        targetJobRole: 'DevOps Architect',
        targetJobTitle: 'DevOps Architect',
        score: 74,
        atsScore: 74,
        createdAt: '2026-06-25T08:20:00Z',
        processedAt: '2026-06-25T08:20:00Z',
        timestamp: '2026-06-25T08:20:00Z'
      },
      {
        analysisId: 'mock-analysis-004',
        reportId: 'mock-analysis-004',
        userId: 'mock-uid-004',
        email: 'sarah.w@startup.co',
        userIdentity: 'sarah.w@startup.co',
        resumeName: 'Sarah_UX_Designer.pdf',
        documentName: 'Sarah_UX_Designer.pdf',
        targetRole: 'Product Designer',
        targetJobRole: 'Product Designer',
        targetJobTitle: 'Product Designer',
        score: 88,
        atsScore: 88,
        createdAt: '2026-06-27T16:50:00Z',
        processedAt: '2026-06-27T16:50:00Z',
        timestamp: '2026-06-27T16:50:00Z'
      }
    ];
  }

  try {
    const db = getDatabase();
    
    // Fetch all analyses
    const analysesSnapshot = await db.ref('analyses').once('value');
    if (!analysesSnapshot.exists()) {
      return [];
    }
    
    const analysesVal = analysesSnapshot.val();
    const keys = Object.keys(analysesVal);
    
    // Fetch all users to map uid to email
    const users = await getAdminUserList();
    const userEmailMap = {};
    users.forEach(u => {
      userEmailMap[u.uid] = u.email;
    });
    
    const reports = keys.map(id => {
      const item = analysesVal[id];
      const email = userEmailMap[item.userId] || 'anonymous@resumetrices.com';
      const scoreVal = item.score || 0;
      const atsScoreVal = item.atsScore || scoreVal;
      const timestampVal = item.createdAt || new Date().toISOString();
      const targetRoleVal = item.targetRole || 'Developer';
      const resName = item.resumeName || 'Resume.pdf';
      
      return {
        analysisId: id,
        reportId: id,
        userId: item.userId || 'anonymous',
        email: email,
        userIdentity: email,
        resumeName: resName,
        documentName: resName,
        targetRole: targetRoleVal,
        targetJobRole: targetRoleVal,
        targetJobTitle: targetRoleVal,
        score: scoreVal,
        atsScore: atsScoreVal,
        createdAt: timestampVal,
        processedAt: timestampVal,
        timestamp: timestampVal
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return reports;
  } catch (error) {
    logger.error('Firebase', `Failed to retrieve admin reports list: ${error.message}`);
    throw new Error(`Failed to retrieve admin reports list: ${error.message}`);
  }
};

/**
 * Retrieves full details of a specific report and maps user's email.
 * @param {string} analysisId - The unique analysis ID.
 * @returns {Promise<object>} Full analysis record with email.
 */
const getAdminReportDetails = async (analysisId) => {
  // Offline/fallback mode
  if (!isFirebaseInitialized || !hasCredentials) {
    const mockReports = [
      {
        analysisId: 'mock-analysis-001',
        userId: 'mock-uid-001',
        email: 'naman@resumetrices.com',
        resumeName: 'Naman_PM_Resume.pdf',
        targetRole: 'Product Manager',
        score: 92,
        atsScore: 92,
        createdAt: '2026-06-20T10:05:00Z',
        skillGap: {
          matchedSkills: ['Product Strategy', 'Product Roadmap', 'User Research'],
          missingSkills: ['SQL Database Analytics', 'A/B Testing Frameworks', 'Jira Epic Mapping'],
          recommendedSkills: ['SQL', 'A/B Testing Tools', 'Agile Product Lifecycle Management'],
          learningRoadmap: [
            { title: 'SQL & Data Foundations', duration: '2 weeks', topics: ['Basic SQL Queries', 'Data Cohort Analysis'] },
            { title: 'A/B Testing Methodologies', duration: '2 weeks', topics: ['Statistical Significance', 'Optimizely Integrations'] }
          ]
        },
        interviewPrep: {
          technical: [
            { question: 'How do you design a database schema to track user cohort retention for a SaaS product?', source_evidence: 'SQL Database Analytics' },
            { question: 'What metrics would you monitor to measure the success of a new onboarding flow?', source_evidence: 'User Research' }
          ],
          projectBased: [
            { question: 'Describe a project where you had to prioritize product features under extreme resource constraints.', source_evidence: 'Product Strategy' }
          ],
          domainKnowledge: [
            { question: 'Explain how A/B testing statistical significance calculations work in product growth scenarios.', source_evidence: 'A/B Testing Frameworks' }
          ],
          behavioral: [
            'Tell me about a time you had a significant disagreement with an engineering lead on a feature implementation.',
            'How do you manage stakeholders when a critical feature is delayed?'
          ],
          hrQuestions: [
            'Why do you want to join Resumetrices as a Product Manager?',
            'Where do you see yourself in the next five years?'
          ]
        }
      },
      {
        analysisId: 'mock-analysis-002',
        userId: 'mock-uid-002',
        email: 'alice@techcorp.io',
        resumeName: 'Alice_SDE3_Backend.pdf',
        targetRole: 'Software Engineer',
        score: 81,
        atsScore: 81,
        createdAt: '2026-06-22T14:35:00Z',
        skillGap: {
          matchedSkills: ['Node.js', 'Express', 'SQL'],
          missingSkills: ['Redis Caching', 'Kubernetes Deployment', 'GraphQL APIs'],
          recommendedSkills: ['Redis caching layers', 'Docker & Kubernetes orchestration', 'GraphQL query schemas'],
          learningRoadmap: [
            { title: 'Caching & Redis', duration: '1 week', topics: ['Cache invalidation patterns', 'Redis client integration'] }
          ]
        },
        interviewPrep: {
          technical: [
            { question: 'How would you handle race conditions when writing concurrent transactions in node-postgres?', source_evidence: 'SQL' }
          ],
          projectBased: [
            { question: 'Describe the design of a highly scalable microservice using Node.js and REST APIs.', source_evidence: 'Node.js' }
          ],
          domainKnowledge: [
            { question: 'Explain the difference between query matching in GraphQL schemas vs REST endpoints.', source_evidence: 'GraphQL APIs' }
          ],
          behavioral: [
            'How do you handle production outages in a backend application?'
          ],
          hrQuestions: [
            'Why are you looking to leave your current role?'
          ]
        }
      },
      {
        analysisId: 'mock-analysis-003',
        userId: 'mock-uid-003',
        email: 'bob.chen@enterprise.dev',
        resumeName: 'Bob_DevOps_Specialist.pdf',
        targetRole: 'DevOps Architect',
        score: 74,
        atsScore: 74,
        createdAt: '2026-06-25T08:20:00Z',
        skillGap: {
          matchedSkills: ['Docker', 'AWS EC2', 'Terraform'],
          missingSkills: ['CI/CD Pipeline Security', 'Prometheus Alerting', 'Service Mesh (Istio)'],
          recommendedSkills: ['HashiCorp Vault secret injection', 'Prometheus monitoring rules', 'Istio sidecar mesh patterns'],
          learningRoadmap: [
            { title: 'Monitoring & Alerting', duration: '2 weeks', topics: ['PromQL syntax', 'Alertmanager templates'] }
          ]
        },
        interviewPrep: {
          technical: [
            { question: 'What is the benefit of using declarative Terraform files over imperative scripts?', source_evidence: 'Terraform' }
          ],
          projectBased: [
            { question: 'Detail a multi-stage Docker build pipeline designed to optimize production image size.', source_evidence: 'Docker' }
          ],
          domainKnowledge: [
            { question: 'How would you secure a Jenkins build agent to prevent secret leaks?', source_evidence: 'CI/CD Pipeline Security' }
          ],
          behavioral: [
            'How do you deal with resistance from development teams when implementing security policies?'
          ],
          hrQuestions: [
            'What interests you most about DevOps and infrastructure engineering?'
          ]
        }
      },
      {
        analysisId: 'mock-analysis-004',
        userId: 'mock-uid-004',
        email: 'sarah.w@startup.co',
        resumeName: 'Sarah_UX_Designer.pdf',
        targetRole: 'Product Designer',
        score: 88,
        atsScore: 88,
        createdAt: '2026-06-27T16:50:00Z',
        skillGap: {
          matchedSkills: ['Figma', 'Wireframing', 'User Testing'],
          missingSkills: ['Design Systems at Scale', 'Micro-interactions', 'Accessibility Audit (WCAG)'],
          recommendedSkills: ['Figma component variables', 'Framer motion prototyping', 'WCAG compliance checkers'],
          learningRoadmap: [
            { title: 'Accessibility and Systems', duration: '2 weeks', topics: ['WCAG AA requirements', 'Screen reader navigation flow'] }
          ]
        },
        interviewPrep: {
          technical: [
            { question: 'Explain how you structure interactive components and tokens in Figma for developer handoff.', source_evidence: 'Figma' }
          ],
          projectBased: [
            { question: 'Describe a project where you redesigned a complex web dashboard layout based on user session heatmaps.', source_evidence: 'User Testing' }
          ],
          domainKnowledge: [
            { question: 'What are the main principles of WCAG accessibility guidelines you check during design?', source_evidence: 'Accessibility Audit (WCAG)' }
          ],
          behavioral: [
            'How do you handle critical design feedback from developers or product owners?'
          ],
          hrQuestions: [
            'What role does user empathy play in your design process?'
          ]
        }
      }
    ];
    return mockReports.find(r => r.analysisId === analysisId) || null;
  }

  try {
    const record = await getAnalysisById(analysisId);
    if (!record) return null;

    // Cross-reference user email
    let email = 'anonymous@resumetrices.com';
    try {
      const { getAuth } = require('firebase-admin/auth');
      const user = await getAuth().getUser(record.userId);
      if (user) email = user.email;
    } catch (e) {
      logger.warn('Firebase', `Could not fetch auth email for user ${record.userId}: ${e.message}`);
      // Fallback to RTDB profile if auth call fails or user is deleted
      const db = getDatabase();
      const profileSnap = await db.ref(`users/${record.userId}/profile`).once('value');
      if (profileSnap.exists()) {
        const profile = profileSnap.val();
        if (profile.email) email = profile.email;
      }
    }

    return {
      ...record,
      email
    };
  } catch (error) {
    logger.error('Firebase', `Failed to retrieve admin report details for ${analysisId}: ${error.message}`);
    throw new Error(`Failed to retrieve admin report details: ${error.message}`);
  }
};

/**
 * Retrieves the current Security Guardrail configurations.
 * @returns {Promise<object>} Guardrail parameters.
 */
const getGuardrailsConfig = async () => {
  return global.guardrails || {
    maintenanceMode: false,
    rateLimitMax: 60,
    maxFileSize: 5 * 1024 * 1024
  };
};

/**
 * Updates the Security Guardrail parameters in RTDB and in-memory.
 * @param {object} updates - Updates like { maintenanceMode, rateLimitMax, maxFileSize }
 * @returns {Promise<boolean>}
 */
const updateGuardrailsConfig = async (updates) => {
  global.guardrails = global.guardrails || {
    maintenanceMode: false,
    rateLimitMax: 60,
    maxFileSize: 5 * 1024 * 1024
  };

  if (updates.maintenanceMode !== undefined) {
    global.guardrails.maintenanceMode = !!updates.maintenanceMode;
  }
  if (updates.rateLimitMax !== undefined) {
    global.guardrails.rateLimitMax = parseInt(updates.rateLimitMax, 10);
  }
  if (updates.maxFileSize !== undefined) {
    global.guardrails.maxFileSize = parseInt(updates.maxFileSize, 10);
  }

  // Fallback/mock mode
  if (!isFirebaseInitialized || !hasCredentials) {
    logger.info('Firebase', `⚠️ Mock mode: Updated guardrail variables in-memory: ${JSON.stringify(global.guardrails)}`);
    return true;
  }

  try {
    const db = getDatabase();
    await db.ref('config/guardrails').set(global.guardrails);
    logger.info('Firebase', `💾 Guardrail configurations successfully updated in Firebase RTDB: ${JSON.stringify(global.guardrails)}`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Firebase Database Guardrail Write Failed: ${error.message}`);
    throw new Error(`Firebase Database Guardrail Write Failed: ${error.message}`);
  }
};

/**
 * Startup hook to retrieve active guardrail configs from DB
 */
const loadActiveGuardrails = async () => {
  global.guardrails = global.guardrails || {
    maintenanceMode: false,
    rateLimitMax: 60,
    maxFileSize: 5 * 1024 * 1024
  };

  if (!isFirebaseInitialized || !hasCredentials) {
    return;
  }

  try {
    const db = getDatabase();
    const snap = await db.ref('config/guardrails').once('value');
    if (snap.exists()) {
      const data = snap.val();
      global.guardrails.maintenanceMode = !!data.maintenanceMode;
      global.guardrails.rateLimitMax = parseInt(data.rateLimitMax, 10) || 60;
      global.guardrails.maxFileSize = parseInt(data.maxFileSize, 10) || (5 * 1024 * 1024);
      logger.info('Firebase', `🛡️ Loaded active guardrail configuration from RTDB: ${JSON.stringify(global.guardrails)}`);
    }
  } catch (err) {
    logger.warn('Firebase', `⚠️ Failed to load guardrail configurations from RTDB: ${err.message}. Using defaults.`);
  }
};

// Auto-run if initialized
if (isFirebaseInitialized && hasCredentials) {
  loadActiveGuardrails();
}

/**
 * Updates a user's profile details in the Realtime Database.
 * @param {string} userId - The target user UID.
 * @param {object} profileUpdate - Object containing displayName, targetDomain, etc.
 * @returns {Promise<boolean>}
 */
const updateUserProfile = async (userId, profileUpdate) => {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId must be a non-empty string.');
  }

  // Mock/fallback mode
  if (!isFirebaseInitialized || !hasCredentials) {
    logger.warn('Firebase', `⚠️ Mock mode: would update user ${userId} profile with ${JSON.stringify(profileUpdate)}`);
    return true;
  }

  try {
    const db = getDatabase();
    await db.ref(`users/${userId}/profile`).update(profileUpdate);
    logger.info('Firebase', `✅ User ${userId} profile updated: ${JSON.stringify(profileUpdate)}`);
    return true;
  } catch (error) {
    logger.error('Firebase', `Failed to update user ${userId} profile: ${error.message}`);
    throw new Error(`Failed to update user profile: ${error.message}`);
  }
};

module.exports = {
  saveAnalysis,
  getUserHistory,
  getAnalysisById,
  getDashboardStats,
  getPublicStats,
  deleteAnalysis,
  renameAnalysis,
  deleteUserAccount,
  getUserData,
  getAdminDashboardStats,
  getAdminUserList,
  updateUserQuota,
  updateUserProfile,
  getAdminReports,
  getAdminReportDetails,
  getGuardrailsConfig,
  updateGuardrailsConfig,
  loadActiveGuardrails,
  isInitialized: () => isFirebaseInitialized,
  hasCredentials: () => hasCredentials
};

