/**
 * @file resumeController.js
 * @description Controllers for resume analysis, skill gap comparison, interview prep,
 * history retrieval, and detailed record loading.
 */

const fs = require('fs');
const crypto = require('crypto');
const pdfParser = require('../services/pdfParser');
const firebaseService = require('../services/firebaseService');
const atsScorer = require('../services/atsScorer');
const aiAnalyzer = require('../services/aiAnalyzer');
const constants = require('../config/constants');
const logger = require('../utils/logger');

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
    logger.info('Pipeline', `📄 File received: "${originalname}" for User ID: ${userId}`);

    // 2. Text Extraction
    logger.info('Pipeline', `🔍 Extracting text from "${originalname}"...`);
    let extractedText;
    try {
      extractedText = await pdfParser.extractText(filePath);
      logger.info('Pipeline', `✅ Successfully extracted text. Length: ${extractedText ? extractedText.length : 0} characters.`);
    } catch (parseError) {
      logger.error('Pipeline', `Parsing Error: ${parseError.message}`);
      const error = new Error('Failed to parse PDF content. Ensure the file is not corrupted.');
      error.statusCode = 422; // Unprocessable Entity
      error.code = 'PARSING_ERROR';
      return next(error);
    }

    // Input Validation: Check text length limit
    if (extractedText.length > constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH) {
      logger.warn('Pipeline', `Extracted text exceeds limit: ${extractedText.length} chars.`);
      const error = new Error(`Resume text length exceeds maximum limit of ${constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH} characters.`);
      error.statusCode = 400;
      error.code = 'TEXT_TOO_LONG';
      return next(error);
    }

    // 3. Realistic Rule-Based ATS Scoring
    logger.info('Pipeline', '🧮 Calculating realistic ATS score breakdown...');
    let scoreAnalysis;
    try {
      scoreAnalysis = atsScorer.scoreResume(extractedText);
      logger.info('Pipeline', `✅ Calculated score: ${scoreAnalysis.overallScore}/100.`);
    } catch (scoreError) {
      logger.error('Pipeline', `Scoring Error: ${scoreError.message}`);
      const error = new Error('Failed to calculate ATS score.');
      error.statusCode = 500;
      error.code = 'SCORING_ERROR';
      return next(error);
    }

    // 4. Claude AI Analysis via OpenRouter
    logger.info('Pipeline', '🤖 Performing AI analysis via Claude...');
    let aiAnalysis;
    try {
      aiAnalysis = await aiAnalyzer.analyzeResumeText(extractedText);
    } catch (aiError) {
      logger.warn('Pipeline', `⚠️ AI Analysis failed, falling back to rule-based evaluation: ${aiError.message}`);
      aiAnalysis = {
        strengths: scoreAnalysis.strengths,
        weaknesses: scoreAnalysis.weaknesses,
        atsTips: ['Clean, standard formatting helps ATS parsing.'],
        rewriteSuggestions: scoreAnalysis.recommendations.slice(0, 3),
        missingKeywords: ['CI/CD', 'Unit Testing', 'Cloud Deployment'],
        recruiterFeedback: 'Claude AI analysis was skipped or encountered an error. Showing local rule-based evaluations instead.'
      };
    }

    // 5. Generate secure cryptographically random UUID for analysis ID and save
    const analysisId = `analysis_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const record = {
      userId: userId,
      resumeName: originalname,
      score: scoreAnalysis.overallScore,
      breakdown: scoreAnalysis.breakdown,
      explanations: scoreAnalysis.explanations,
      strengths: aiAnalysis.strengths,
      weaknesses: aiAnalysis.weaknesses,
      recommendations: scoreAnalysis.recommendations,
      atsTips: aiAnalysis.atsTips,
      rewriteSuggestions: aiAnalysis.rewriteSuggestions,
      missingKeywords: aiAnalysis.missingKeywords,
      missingSections: scoreAnalysis.missingSections || [],
      recruiterFeedback: aiAnalysis.recruiterFeedback,
      skillGap: aiAnalysis.skillGap || null,
      interviewPrep: aiAnalysis.interviewPrep || null,
      extractedText: extractedText,
      createdAt: createdAt
    };

    logger.info('Pipeline', `💾 Saving results to Firebase under ID: ${analysisId}...`);
    try {
      await firebaseService.saveAnalysis(analysisId, record);
      logger.info('Pipeline', '✅ Saved to Firebase successfully.');
    } catch (dbError) {
      logger.error('Pipeline', `Database Write Error: ${dbError.message}`);
      const error = new Error('Failed to save analysis record to database.');
      error.statusCode = 500;
      error.code = 'DATABASE_WRITE_ERROR';
      return next(error);
    }

    const duration = Date.now() - startTime;
    logger.info('Pipeline', `⏱️ Resume analysis completed in ${duration}ms.`);

    // Return combined response (satisfies both legacy upload response structures and new SaaS schemas)
    return res.status(200).json({
      success: true,
      analysisId: analysisId,
      userId: userId,
      resumeName: originalname,
      score: scoreAnalysis.overallScore,
      breakdown: scoreAnalysis.breakdown,
      explanations: scoreAnalysis.explanations,
      strengths: aiAnalysis.strengths,
      weaknesses: aiAnalysis.weaknesses,
      recommendations: scoreAnalysis.recommendations,
      atsTips: aiAnalysis.atsTips,
      rewriteSuggestions: aiAnalysis.rewriteSuggestions,
      missingKeywords: aiAnalysis.missingKeywords,
      missingSections: scoreAnalysis.missingSections,
      recruiterFeedback: aiAnalysis.recruiterFeedback,
      skillGap: aiAnalysis.skillGap || null,
      interviewPrep: aiAnalysis.interviewPrep || null,
      text: extractedText,
      createdAt: createdAt
    });

  } catch (error) {
    logger.error('Pipeline', `Unexpected Pipeline Error: ${error.message}`);
    next(error);
  } finally {
    // 6. Security Cleanup: Ensure uploaded file is deleted from disk to prevent leaks/PII exposure
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
 * @route GET /api/history
 * @desc Get upload and analysis history for the logged-in user.
 * @access Private
 */
exports.getAnalysisHistory = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.uid : 'anonymous';
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
    logger.info('AnalysisDetail', `📂 Retrieving analysis detail for ID: ${id}`);
    
    const analysis = await firebaseService.getAnalysisById(id);
    
    if (!analysis) {
      const error = new Error('Analysis record not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Security Check: Verify user owns the record. Enforce in all environments.
    if (analysis.userId !== userId) {
      logger.warn('AnalysisDetail', `Access denied: User ${userId} requested record owned by ${analysis.userId}`);
      const error = new Error('Access denied. You are not authorized to view this analysis.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
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
  
  try {
    const { resumeText, targetRole } = req.body;
    
    // Request Validation
    if (!targetRole || typeof targetRole !== 'string' || targetRole.trim() === '') {
      const error = new Error('Target role is required and must be a non-empty string.');
      error.statusCode = 400;
      error.code = 'INVALID_INPUT';
      return next(error);
    }
    
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      const error = new Error('Resume text content is required.');
      error.statusCode = 400;
      error.code = 'INVALID_INPUT';
      return next(error);
    }

    // Input Validation: Check text length limit
    if (resumeText.length > constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH) {
      logger.warn('SkillGap', `Resume text length exceeds limit: ${resumeText.length}`);
      const error = new Error(`Resume text content exceeds maximum limit of ${constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH} characters.`);
      error.statusCode = 400;
      error.code = 'TEXT_TOO_LONG';
      return next(error);
    }

    logger.info('SkillGap', `📄 Target Role: "${targetRole}", Resume text length: ${resumeText.length}`);

    // Perform AI Skill Gap Analysis
    logger.info('SkillGap', '🤖 Requesting AI skill gap analysis...');
    let result;
    try {
      result = await aiAnalyzer.analyzeSkillGap(resumeText, targetRole);
      logger.info('SkillGap', '✅ Skill gap analysis completed successfully.');
    } catch (aiError) {
      logger.error('SkillGap', `Skill Gap Analysis Error: ${aiError.message}`);
      const error = new Error('Failed to complete skill gap analysis.');
      error.statusCode = 500;
      error.code = 'AI_ANALYSIS_ERROR';
      return next(error);
    }

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
  
  try {
    const { resumeText } = req.body;
    
    // Request Validation
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      const error = new Error('Resume text content is required.');
      error.statusCode = 400;
      error.code = 'INVALID_INPUT';
      return next(error);
    }

    // Input Validation: Check text length limit
    if (resumeText.length > constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH) {
      logger.warn('InterviewPrep', `Resume text length exceeds limit: ${resumeText.length}`);
      const error = new Error(`Resume text content exceeds maximum limit of ${constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH} characters.`);
      error.statusCode = 400;
      error.code = 'TEXT_TOO_LONG';
      return next(error);
    }

    logger.info('InterviewPrep', `📄 Resume text length: ${resumeText.length}`);

    // Generate Interview Questions
    logger.info('InterviewPrep', '🤖 Requesting AI interview questions...');
    let result;
    try {
      result = await aiAnalyzer.generateInterviewQuestions(resumeText);
      logger.info('InterviewPrep', '✅ Interview questions generated successfully.');
    } catch (aiError) {
      logger.error('InterviewPrep', `Interview Questions Error: ${aiError.message}`);
      const error = new Error('Failed to generate interview questions.');
      error.statusCode = 500;
      error.code = 'AI_ANALYSIS_ERROR';
      return next(error);
    }

    const duration = Date.now() - startTime;
    logger.info('InterviewPrep', `⏱️ Interview questions generation completed in ${duration}ms.`);

    return res.status(200).json({
      success: true,
      technical: result.technical,
      projectBased: result.projectBased,
      behavioral: result.behavioral,
      hrQuestions: result.hrQuestions
    });
    
  } catch (error) {
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
    logger.info('DeleteAnalysis', `🗑️ Request to delete analysis ID: ${id} by User ID: ${userId}`);

    // Verify record exists first
    const analysis = await firebaseService.getAnalysisById(id);
    if (!analysis) {
      const error = new Error('Analysis record not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }

    // Verify ownership
    if (analysis.userId !== userId) {
      logger.warn('DeleteAnalysis', `Access denied: User ${userId} tried to delete record owned by ${analysis.userId}`);
      const error = new Error('Access denied. You are not authorized to delete this analysis.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
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
