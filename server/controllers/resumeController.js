/**
 * @file resumeController.js
 * @description Controllers for resume analysis, skill gap comparison, interview prep,
 * history retrieval, and detailed record loading.
 */

const fs = require('fs');
const firebaseService = require('../services/firebaseService');
const resumeService = require('../services/resumeService');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * @route POST /api/analyze (and /api/upload)
 * @desc Complete resume analysis: extract text, score, run AI analysis, save to database, and return results.
 * @access Private
 */
exports.analyzeResume = async (req, res, next) => {
  const startTime = Date.now();
  logger.info('Pipeline', '🚀 Starting resume analysis pipeline...');
  
  let filePathToDelete = null;

  try {
    // 1. File Validation
    if (!req.file) {
      logger.error('Pipeline', 'Validation Error: No file uploaded.');
      const error = new Error('No file uploaded. Please select a PDF resume file.');
      error.statusCode = 400;
      error.code = 'MISSING_FILE';
      return next(error);
    }

    const { path: filePath, originalname } = req.file;
    filePathToDelete = filePath;
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }
    logger.info('Pipeline', `📄 [STAGE 1: Receipt] File received: "${originalname}" for User ID: ${userId}`);

    const { targetRole } = req.body;

    const { analysisId, record } = await resumeService.processResumeAnalysis(userId, req.file, targetRole);

    const duration = Date.now() - startTime;
    logger.info('Pipeline', `⏱️ Resume analysis completed in ${duration}ms.`);

    return res.status(200).json({
      success: true,
      analysisId: analysisId,
      userId: userId,
      resumeName: originalname,
      targetRole: targetRole,
      score: record.score,
      breakdown: record.breakdown,
      explanations: record.explanations,
      strengths: record.strengths,
      weaknesses: record.weaknesses,
      recommendations: record.recommendations,
      atsTips: record.atsTips,
      rewriteSuggestions: record.rewriteSuggestions,
      missingKeywords: record.missingKeywords,
      missingSections: record.missingSections,
      recruiterFeedback: record.recruiterFeedback,
      skillGap: record.skillGap,
      interviewPrep: record.interviewPrep,
      createdAt: record.createdAt
    });

  } catch (error) {
    if (error.code === 'EXTRACTION_FAILED') {
      return res.status(400).json({
        success: false,
        userMessage: 'We could not read text from your PDF. It may be a scanned image or a corrupted file. Please try a different PDF.'
      });
    }
    if (error.code === 'INVALID_DOCUMENT_TYPE') {
      return res.status(400).json({
        success: false,
        userMessage: error.message || "This doesn't appear to be a resume. Please upload a resume PDF."
      });
    }
    if (error.message === 'AI_DAILY_LIMIT_EXHAUSTED') {
      return res.status(503).json({
        success: false,
        userMessage: 'Daily analysis limit reached. Please try again after midnight UTC.'
      });
    }
    if (error.message === 'AI_RESPONSE_INVALID') {
      return res.status(503).json({
        success: false,
        userMessage: 'Analysis could not be completed. Please try again in a moment.'
      });
    }
    if (error.message === 'AI_RATE_LIMIT_EXHAUSTED' || error.code === 'AI_RATE_LIMIT_EXHAUSTED') {
      return res.status(503).json({
        success: false,
        userMessage: 'Our AI analysis service is temporarily at capacity. Please try again in a few hours.'
      });
    }
    // All other errors
    console.error('[resumeController] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      userMessage: 'Something went wrong. Please try again.'
    });
  } finally {
    if (filePathToDelete && fs.existsSync(filePathToDelete)) {
      fs.unlink(filePathToDelete, (err) => {
        if (err) {
          logger.error('Pipeline', `Failed to clean up uploaded file: ${filePathToDelete}`, { error: err.message });
        } else {
          logger.info('Pipeline', `🧹 Successfully cleaned up uploaded file from disk: ${filePathToDelete}`);
        }
      });
    }
  }
};

/**
 * @route POST /api/public/analyze
 * @desc Handle resume upload and analysis for guest users (anonymous).
 * @access Public
 */
exports.analyzePublicResume = async (req, res, next) => {
  const startTime = Date.now();
  logger.info('Pipeline', '🚀 Starting public resume analysis pipeline...');
  
  let filePathToDelete = null;

  try {
    // 1. File Validation
    if (!req.file) {
      logger.error('Pipeline', 'Validation Error: No file uploaded.');
      const error = new Error('No file uploaded. Please select a PDF resume file.');
      error.statusCode = 400;
      error.code = 'MISSING_FILE';
      return next(error);
    }

    const { path: filePath, originalname } = req.file;
    filePathToDelete = filePath;
    const userId = 'anonymous';
    logger.info('Pipeline', `📄 [STAGE 1: Receipt] Public file received: "${originalname}"`);

    const { targetRole } = req.body;

    const { analysisId, record } = await resumeService.processResumeAnalysis(userId, req.file, targetRole);

    const duration = Date.now() - startTime;
    logger.info('Pipeline', `⏱️ Public resume analysis completed in ${duration}ms.`);

    return res.status(200).json({
      success: true,
      analysisId: analysisId,
      userId: userId,
      resumeName: originalname,
      targetRole: targetRole,
      score: record.score,
      breakdown: record.breakdown,
      explanations: record.explanations,
      strengths: record.strengths,
      weaknesses: record.weaknesses,
      recommendations: record.recommendations,
      atsTips: record.atsTips,
      rewriteSuggestions: record.rewriteSuggestions,
      missingKeywords: record.missingKeywords,
      missingSections: record.missingSections,
      recruiterFeedback: record.recruiterFeedback,
      skillGap: record.skillGap,
      interviewPrep: record.interviewPrep,
      createdAt: record.createdAt
    });
  } catch (error) {
    if (error.code === 'EXTRACTION_FAILED') {
      return res.status(400).json({
        success: false,
        userMessage: 'We could not read text from your PDF. It may be a scanned image or a corrupted file. Please try a different PDF.'
      });
    }
    if (error.code === 'INVALID_DOCUMENT_TYPE') {
      return res.status(400).json({
        success: false,
        userMessage: error.message || "This doesn't appear to be a resume. Please upload a resume PDF."
      });
    }
    if (error.message === 'AI_DAILY_LIMIT_EXHAUSTED') {
      return res.status(503).json({
        success: false,
        userMessage: 'Daily analysis limit reached. Please try again after midnight UTC.'
      });
    }
    if (error.message === 'AI_RESPONSE_INVALID') {
      return res.status(503).json({
        success: false,
        userMessage: 'Analysis could not be completed. Please try again in a moment.'
      });
    }
    if (error.message === 'AI_RATE_LIMIT_EXHAUSTED' || error.code === 'AI_RATE_LIMIT_EXHAUSTED') {
      return res.status(503).json({
        success: false,
        userMessage: 'Our AI analysis service is temporarily at capacity. Please try again in a few hours.'
      });
    }
    // All other errors
    console.error('[resumeController] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      userMessage: 'Something went wrong. Please try again.'
    });
  } finally {
    // Clean up uploaded file from local server disk
    if (filePathToDelete) {
      const fs = require('fs');
      fs.unlink(filePathToDelete, (err) => {
        if (err) {
          logger.error('Pipeline', `Failed to clean up uploaded file: ${filePathToDelete}`, { error: err.message });
        } else {
          logger.info('Pipeline', `🧹 Successfully cleaned up uploaded file from disk: ${filePathToDelete}`);
        }
      });
    }
  }
};

exports.analyzeResumeStream = async (req, res, next) => {
  const startTime = Date.now();
  logger.info('Pipeline', '🚀 Starting streaming resume analysis pipeline...');

  let filePathToDelete = null;
  let isClientConnected = true;

  req.on('close', () => {
    if (isClientConnected) {
      isClientConnected = false;
      logger.warn('Pipeline', '🔌 Client disconnected from SSE stream. Aborting pipeline...');
      if (filePathToDelete && fs.existsSync(filePathToDelete)) {
        try {
          fs.unlinkSync(filePathToDelete);
          logger.info('Pipeline', `🧹 Cleaned up file on disconnect: ${filePathToDelete}`);
        } catch (err) {
          logger.error('Pipeline', `Failed to unlink file on disconnect: ${err.message}`);
        }
      }
    }
  });

  try {
    // 1. File Validation
    if (!req.file) {
      logger.error('Pipeline', 'Validation Error: No file uploaded.');
      return res.status(400).json({
        success: false,
        userMessage: 'No file uploaded. Please select a PDF resume file.'
      });
    }

    const { path: filePath, originalname } = req.file;
    filePathToDelete = filePath;
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({
        success: false,
        userMessage: 'Access denied. Authentication required.'
      });
    }

    const { targetRole } = req.body;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onProgress = (data) => {
      if (!isClientConnected) {
        throw new Error('CLIENT_DISCONNECTED');
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const { analysisId, record } = await resumeService.processResumeAnalysis(userId, req.file, targetRole, onProgress);

    const result = {
      analysisId: analysisId,
      userId: userId,
      resumeName: originalname,
      targetRole: targetRole,
      score: record.score,
      breakdown: record.breakdown,
      explanations: record.explanations,
      strengths: record.strengths,
      weaknesses: record.weaknesses,
      recommendations: record.recommendations,
      atsTips: record.atsTips,
      rewriteSuggestions: record.rewriteSuggestions,
      missingKeywords: record.missingKeywords,
      missingSections: record.missingSections,
      recruiterFeedback: record.recruiterFeedback,
      skillGap: record.skillGap,
      interviewPrep: record.interviewPrep,
      createdAt: record.createdAt
    };

    const duration = Date.now() - startTime;
    logger.info('Pipeline', `⏱️ Streaming resume analysis completed in ${duration}ms.`);

    if (isClientConnected) {
      res.write(`data: ${JSON.stringify({ stage: 'result', data: result })}\n\n`);
      res.end();
    }
  } catch (error) {
    if (error.message === 'CLIENT_DISCONNECTED') {
      logger.info('Pipeline', 'Pipeline aborted due to client disconnect.');
      return;
    }

    logger.error('Pipeline', `Stream Analysis Error: ${error.message}`);
    
    if (isClientConnected) {
      const isDailyLimited = error.message === 'AI_DAILY_LIMIT_EXHAUSTED';
      const isInvalid = error.message === 'AI_RESPONSE_INVALID';
      const isRateLimited = error.message === 'AI_RATE_LIMIT_EXHAUSTED' || error.code === 'AI_RATE_LIMIT_EXHAUSTED';
      let userMessage;
      if (isDailyLimited) {
        userMessage = 'Daily analysis limit reached. Please try again after midnight UTC.';
      } else if (isInvalid) {
        userMessage = 'Analysis could not be completed. Please try again in a moment.';
      } else if (isRateLimited) {
        userMessage = 'Our AI analysis service is temporarily at capacity. Please try again in a few hours.';
      } else {
        userMessage = error.message || 'Something went wrong. Please try again.';
      }
      
      res.write(`data: ${JSON.stringify({ stage: 'error', message: userMessage })}\n\n`);
      res.end();
    }
  } finally {
    if (filePathToDelete && fs.existsSync(filePathToDelete)) {
      fs.unlink(filePathToDelete, (err) => {
        if (err) {
          logger.error('Pipeline', `Failed to clean up uploaded file: ${filePathToDelete}`, { error: err.message });
        } else {
          logger.info('Pipeline', `🧹 Successfully cleaned up uploaded file from disk: ${filePathToDelete}`);
        }
      });
    }
  }
};

/**
 * @route GET /api/public/stats
 * @desc Get global aggregated metrics from Firebase for unauthenticated landing stats.
 * @access Public
 */
exports.getPublicStats = async (req, res, next) => {
  try {
    const stats = await firebaseService.getPublicStats();
    return res.status(200).json({
      success: true,
      stats: stats
    });
  } catch (error) {
    logger.error('PublicStats', `Error aggregating public stats: ${error.message}`);
    next(error);
  }
};

/**
 * @route GET /api/history
 * @desc Get upload and analysis history for the logged-in user.
 * @access Private
 */
exports.getAnalysisHistory = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }
    logger.info('History', `📂 Retrieving analysis history for User ID: ${userId}`);
    
    const history = await firebaseService.getUserHistory(userId);
    
    return res.status(200).json({
      success: true,
      history: history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/dashboard/stats
 * @desc Get aggregated dashboard statistics and recent analysis summaries.
 * @access Private
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }
    logger.info('DashboardStats', `📊 Retrieving dashboard stats for User ID: ${userId}`);
    
    const stats = await firebaseService.getDashboardStats(userId);
    
    return res.status(200).json({
      success: true,
      stats: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/analysis/:id
 * @desc Get full analysis details for a specific analysis record.
 * @access Private
 */
exports.getAnalysisById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }
    logger.info('AnalysisDetail', `📂 Retrieving analysis detail for ID: ${id}`);
    
    const analysis = await firebaseService.getAnalysisById(id);
    if (!analysis) return res.status(404).json({ success: false, message: 'Not found' });
    if (analysis.userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (analysis) {
      delete analysis.resumeText;
      delete analysis.detectedSkills;
      delete analysis.atsScore;
    }

    return res.status(200).json({
      success: true,
      analysis: analysis
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/skills/gap
 * @desc Compare resume text against industry target role expectations.
 * @access Private
 */
exports.analyzeSkillGap = async (req, res, next) => {
  const startTime = Date.now();
  logger.info('SkillGap', '🚀 Starting skill gap analysis...');
  const userId = req.user ? req.user.uid : 'anonymous';
  if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
    const error = new Error('Access denied. Authentication required.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    return next(error);
  }
  
  try {
    const result = await resumeService.processSkillGapAnalysis(userId, req.body);

    const duration = Date.now() - startTime;
    logger.info('SkillGap', `⏱️ Skill gap analysis completed in ${duration}ms.`);

    return res.status(200).json({
      success: true,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      recommendedSkills: result.recommendedSkills,
      learningRoadmap: result.learningRoadmap
    });
    
  } catch (error) {
    if (error.message === 'AI_DAILY_LIMIT_EXHAUSTED') {
      return res.status(503).json({
        success: false,
        userMessage: 'Daily analysis limit reached. Please try again after midnight UTC.'
      });
    }
    logger.error('SkillGap', `Unexpected Skill Gap Error: ${error.message}`);
    next(error);
  }
};

/**
 * @route POST /api/interview/questions
 * @desc Generate customized interview questions based on resume content.
 * @access Private
 */
exports.generateInterviewQuestions = async (req, res, next) => {
  const startTime = Date.now();
  logger.info('InterviewPrep', '🚀 Starting interview questions generation...');
  const userId = req.user ? req.user.uid : 'anonymous';
  if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
    const error = new Error('Access denied. Authentication required.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    return next(error);
  }
  
  try {
    const result = await resumeService.processInterviewQuestions(userId, req.body);

    const duration = Date.now() - startTime;
    logger.info('InterviewPrep', `⏱️ Interview questions generation completed in ${duration}ms.`);

    return res.status(200).json({
      success: true,
      technical: result.technical,
      projectBased: result.projectBased,
      skillGap: result.skillGap,
      domainKnowledge: result.domainKnowledge,
      behavioral: result.behavioral,
      hrQuestions: result.hrQuestions,
      gradingRubric: result.gradingRubric
    });
    
  } catch (error) {
    if (error.message === 'AI_DAILY_LIMIT_EXHAUSTED') {
      return res.status(503).json({
        success: false,
        userMessage: 'Daily analysis limit reached. Please try again after midnight UTC.'
      });
    }
    logger.error('InterviewPrep', `Unexpected Interview Questions Error: ${error.message}`);
    next(error);
  }
};

/**
 * @route GET /api/resumes/history (legacy)
 * @desc Returns legacy mock history values.
 * @access Private (Updated to private for safety)
 */
exports.getUploadHistory = async (req, res, next) => {
  try {
    return res.status(200).json({
      status: 'success',
      data: [
        {
          id: "1",
          fileName: "Jane_Doe_Resume_2026.pdf",
          overallScore: 82,
          analyzedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        }
      ]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route DELETE /api/analysis/:id
 * @desc Delete a single analysis record by ID.
 * @access Private
 */
exports.deleteAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }
    logger.info('DeleteAnalysis', `🗑️ Request to delete analysis ID: ${id} by User ID: ${userId}`);

    // Verify record exists first
    const analysis = await firebaseService.getAnalysisById(id);
    if (!analysis) return res.status(404).json({ success: false, message: 'Not found' });
    if (analysis.userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Delete
    await firebaseService.deleteAnalysis(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Analysis deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route PUT /api/analysis/:id/rename
 * @desc Rename a single analysis record by ID.
 * @access Private
 */
exports.renameAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resumeName } = req.body;
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }
    if (!resumeName || typeof resumeName !== 'string' || !resumeName.trim()) {
      const error = new Error('resumeName is required and must be a non-empty string.');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    logger.info('RenameAnalysis', `✏️ Request to rename analysis ID: ${id} to "${resumeName}" by User ID: ${userId}`);

    // Verify record exists first
    const analysis = await firebaseService.getAnalysisById(id);
    if (!analysis) return res.status(404).json({ success: false, message: 'Not found' });
    if (analysis.userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Rename
    await firebaseService.renameAnalysis(id, userId, resumeName.trim());

    return res.status(200).json({
      success: true,
      message: 'Analysis renamed successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route DELETE /api/user
 * @desc Complete user account data purge from database.
 * @access Private
 */
exports.deleteUserAccount = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    logger.info('DeleteUserAccount', `💀 Purging all user data for user ID: ${userId}`);

    // Call service to wipe user analyses + database records
    await firebaseService.deleteUserAccount(userId);

    return res.status(200).json({
      success: true,
      message: 'All user data has been successfully purged.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route GET /api/user/export
 * @desc Export all user data.
 * @access Private
 */
exports.exportUserData = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    logger.info('ExportUserData', `📥 Exporting all user data for user ID: ${userId}`);

    const userData = await firebaseService.getUserData(userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="profile-export.json"');
    
    return res.status(200).json(userData);
  } catch (error) {
    next(error);
  }
};

/**
 * @route PUT /api/user/profile
 * @desc Update user profile settings in Realtime Database.
 * @access Private
 */
exports.updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous' && process.env.NODE_ENV !== 'development') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    const { displayName, targetDomain } = req.body;

    logger.info('UpdateUserProfile', `Request body received for User ID ${userId}:`, req.body);

    const profileUpdate = {};
    if (displayName && displayName.trim()) {
      profileUpdate.displayName = displayName.trim();
    }
    if (targetDomain && targetDomain.trim()) {
      profileUpdate.targetDomain = targetDomain.trim();
    }

    // Perform database write if there are fields to update
    if (Object.keys(profileUpdate).length > 0) {
      await firebaseService.updateUserProfile(userId, profileUpdate);
    }

    // Return the updated data
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      displayName: profileUpdate.displayName,
      targetDomain: profileUpdate.targetDomain
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/analysis/store-anonymous
 * @description Store anonymous analysis temporarily
 */
exports.storeAnonymousAnalysis = async (req, res, next) => {
  try {
    const { sessionId, analysisData } = req.body;
    if (!sessionId || !analysisData) {
      const error = new Error('sessionId and analysisData are required.');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    logger.info('StoreAnonymous', `📥 Request to store anonymous analysis for sessionId: ${sessionId}`);

    // Trigger cleanup job for expired entries on each call to prevent orphan data accumulating
    try {
      await firebaseService.cleanupExpiredAnonymousAnalyses();
    } catch (cleanupErr) {
      logger.error('StoreAnonymous', `Expired cleanup failure: ${cleanupErr.message}`);
    }

    await firebaseService.storeAnonymousAnalysis(sessionId, analysisData);

    return res.status(200).json({
      success: true,
      message: 'Anonymous analysis stored successfully.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/analysis/claim
 * @description Claim/migrate an anonymous analysis to the authenticated user's account
 */
exports.claimAnalysis = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
    if (userId === 'anonymous') {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      const error = new Error('sessionId is required.');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    logger.info('ClaimAnalysis', `🔑 User ${userId} is claiming anonymous analysis with sessionId: ${sessionId}`);

    // Fetch the anonymous analysis
    const anonRecord = await firebaseService.getAnonymousAnalysis(sessionId);
    if (!anonRecord) {
      logger.warn('ClaimAnalysis', `Anonymous session ${sessionId} not found or expired.`);
      const error = new Error('The previous analysis could not be found or has expired.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Verify it exists and has not expired (expiresAt check)
    const now = new Date().toISOString();
    if (anonRecord.expiresAt && anonRecord.expiresAt < now) {
      logger.warn('ClaimAnalysis', `Anonymous session ${sessionId} has expired. Expiry time: ${anonRecord.expiresAt}`);
      const error = new Error('The previous analysis has expired.');
      error.statusCode = 404;
      error.code = 'EXPIRED';
      return next(error);
    }

    // Write the full analysis to the user's analyses collection
    const newAnalysisId = `analysis_${crypto.randomUUID()}`;
    const rawAnalysisData = anonRecord.analysisData;
    
    // Set user ownership on payload
    rawAnalysisData.userId = userId;
    rawAnalysisData.analysisId = newAnalysisId;
    if (rawAnalysisData.createdAt) {
      rawAnalysisData.createdAt = new Date().toISOString();
    }

    await firebaseService.saveAnalysis(newAnalysisId, rawAnalysisData);

    // Delete the anonymous temp entry
    await firebaseService.deleteAnonymousAnalysis(sessionId);

    logger.info('ClaimAnalysis', `✅ Claim successful. Session ${sessionId} migrated to analysis record ${newAnalysisId} for User ${userId}.`);

    return res.status(200).json({
      success: true,
      message: 'Analysis claimed successfully.',
      analysisId: newAnalysisId
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/report-issue
 * @description Report an issue with validation and 5-minute rate limiting
 */
exports.reportIssue = async (req, res, next) => {
  try {
    const uid = req.user ? req.user.uid : '';
    const email = req.user ? req.user.email : '';

    if (!uid || !email) {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    const { issueType, issueDescription } = req.body;

    // Validate inputs
    const allowedCategories = ['Bug', 'Wrong Analysis', 'UI Problem', 'Account Issue', 'Other'];
    if (!issueType || !allowedCategories.includes(issueType)) {
      const error = new Error('Invalid issue type.');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    if (!issueDescription || typeof issueDescription !== 'string' || issueDescription.length < 10 || issueDescription.length > 1000) {
      const error = new Error('Description must be between 10 and 1000 characters.');
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      return next(error);
    }

    // Rate Limit: 5 minutes check
    const lastReportTime = await firebaseService.getUserLastIssueReportTimestamp(uid);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (now - lastReportTime < fiveMinutes) {
      const error = new Error('Rate limit exceeded. Please wait 5 minutes between reports.');
      error.statusCode = 429;
      error.code = 'TOO_MANY_REQUESTS';
      return next(error);
    }

    // Read displayName
    const userName = await firebaseService.getUserDisplayName(uid);

    // Save report
    const reportId = `report_${crypto.randomUUID()}`;
    const reportData = {
      uid,
      userName: userName || email.split('@')[0],
      userEmail: email,
      issueType,
      issueDescription: issueDescription.trim(),
      status: 'open',
      createdAt: now
    };

    try {
      await firebaseService.storeUserIssueReport(reportId, reportData);
      await firebaseService.updateUserLastIssueReportTimestamp(uid, now);
      
      return res.status(200).json({
        success: true,
        message: 'Report submitted successfully.'
      });
    } catch (writeErr) {
      logger.error('ReportIssue', `Database write failed: ${writeErr.message}`);
      return res.status(500).json({
        success: false,
        message: 'Something went wrong. Please try again.'
      });
    }
  } catch (error) {
    // Never leak stack trace or internal error messages to client
    logger.error('ReportIssue', `Server error: ${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 429 
        ? "You've already submitted a report recently. Please try again later."
        : (error.statusCode === 400 ? error.message : 'Something went wrong. Please try again.')
    });
  }
};

/**
 * @route GET /api/reports
 * @description Retrieve all issue reports created by the authenticated user
 */
exports.getUserReports = async (req, res, next) => {
  try {
    const uid = req.user ? req.user.uid : '';
    if (!uid) {
      const error = new Error('Access denied. Authentication required.');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    const reports = await firebaseService.getUserIssueReportsByUid(uid);
    return res.status(200).json({
      success: true,
      reports: reports
    });
  } catch (error) {
    logger.error('GetUserReports', `Failed to fetch user reports: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    });
  }
};
