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
const candidateProfiler = require('../services/candidateProfiler');
const difficultyEngine = require('../services/difficultyEngine');
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
    logger.info('Pipeline', `📄 [STAGE 1: Receipt] File received: "${originalname}" for User ID: ${userId}`);

    // Validate targetRole
    const { targetRole } = req.body;
    if (!targetRole || typeof targetRole !== 'string' || targetRole.trim() === '') {
      logger.error('Pipeline', 'Validation Error: No target job role selected.');
      const error = new Error('Please upload a resume and select a target job role before starting the analysis.');
      error.statusCode = 400;
      error.code = 'MISSING_TARGET_ROLE';
      return next(error);
    }

    // 2. Text Extraction
    logger.info('Pipeline', `🔍 [STAGE 2: Text Extraction] Extracting text from "${originalname}"...`);
    let extractedText;
    try {
      extractedText = await pdfParser.extractText(filePath);
      const snippet = extractedText ? extractedText.trim().substring(0, 100).replace(/\r?\n/g, ' ') : '';
      logger.info('Pipeline', `✅ [STAGE 2: Text Extraction] Successfully extracted text. Length: ${extractedText ? extractedText.length : 0} characters. Snippet: "${snippet}..."`);
    } catch (parseError) {
      logger.error('Pipeline', `Parsing Error: ${parseError.message}`);
      const error = new Error('Failed to parse PDF content. Ensure the file is not corrupted.');
      error.statusCode = 422; // Unprocessable Entity
      error.code = 'PARSING_ERROR';
      return next(error);
    }

    // Input Validation: Check text length >= 100 characters
    if (!extractedText || extractedText.trim().length < 100) {
      logger.error('Pipeline', `Validation Error: Extracted text is too short (${extractedText ? extractedText.trim().length : 0} characters).`);
      const error = new Error('Resume content could not be extracted.');
      error.statusCode = 400;
      error.code = 'EXTRACTION_FAILED';
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

    // 3. Document Type Classification
    logger.info('Pipeline', '🔍 [STAGE 3: Classification] Running document type classification...');
    let docType;
    try {
      docType = await aiAnalyzer.classifyDocument(extractedText);
      logger.info('Pipeline', `✅ [STAGE 3: Classification] Document type classified as: "${docType}"`);
    } catch (classError) {
      logger.error('Pipeline', `Document classification failed: ${classError.message}`);
      docType = 'Unknown';
    }

    // Reject if not Resume or CV
    if (docType !== 'Resume' && docType !== 'CV') {
      logger.warn('Pipeline', `[STAGE 3: Classification] Rejected document type: "${docType}" (not Resume or CV).`);
      const message = docType === 'Unknown'
        ? 'Unable to determine document type. Please upload a valid resume.'
        : 'Uploaded document is not a resume. ATS analysis unavailable.';
      const error = new Error(message);
      error.statusCode = 400;
      error.code = 'INVALID_DOCUMENT_TYPE';
      error.documentType = docType;
      return next(error);
    }

    // 4. Realistic Rule-Based ATS Scoring
    logger.info('Pipeline', '🧮 [STAGE 4: Scoring] Calculating realistic ATS score breakdown...');
    let scoreAnalysis;
    try {
      scoreAnalysis = atsScorer.scoreResume(extractedText, targetRole);
      logger.info('Pipeline', `✅ [STAGE 4: Scoring] Calculated score: ${scoreAnalysis.overallScore}/100.`);
    } catch (scoreError) {
      logger.error('Pipeline', `Scoring Error: ${scoreError.message}`);
      const error = new Error('Failed to calculate ATS score.');
      error.statusCode = 500;
      error.code = 'SCORING_ERROR';
      return next(error);
    }

    // 5. Claude AI Analysis via OpenRouter
    logger.info('Pipeline', '🤖 [STAGE 5: AI Analysis] Performing AI analysis via Claude/Nemotron...');
    let aiAnalysis;
    try {
      aiAnalysis = await aiAnalyzer.analyzeResumeText(extractedText, targetRole, scoreAnalysis);
      logger.info('Pipeline', '✅ [STAGE 5: AI Analysis] Received AI analysis response successfully.');
    } catch (aiError) {
      logger.warn('Pipeline', `⚠️ AI Analysis failed, falling back to rule-based evaluation: ${aiError.message}`);
      aiAnalysis = aiAnalyzer.getMockRoleBasedAts(targetRole);
    }

    // 6. Generate Skill Gap and Interview Prep for the record
    logger.info('Pipeline', '🤖 [STAGE 6: Skill Gap & Interview Prep] Generating related analyses...');
    let skillGap = null;
    let interviewPrep = null;
    try {
      skillGap = await aiAnalyzer.analyzeSkillGap(extractedText, targetRole, scoreAnalysis.detectedSkills || []);
      if (skillGap) {
        skillGap.targetRole = targetRole;
      }
    } catch (sgErr) {
      logger.error('Pipeline', `Failed to generate skill gap in pipeline: ${sgErr.message}`);
      skillGap = {
        targetRole: targetRole,
        matchedSkills: scoreAnalysis.detectedSkills || [],
        missingSkills: targetRole.toLowerCase().includes('front') ? ['Redux', 'Jest'] : ['TensorFlow', 'PyTorch', 'MLOps'],
        recommendedSkills: targetRole.toLowerCase().includes('front') ? ['TypeScript'] : ['Python', 'Docker'],
        learningRoadmap: ['Phase 1: Complete online tutorials', 'Phase 2: Build a role-specific project']
      };
    }

    try {
      const projects = aiAnalyzer.extractProjectsFromText(extractedText);
      const candidateProfile = candidateProfiler.buildCandidateProfile(
        extractedText,
        targetRole || 'Software Engineer',
        scoreAnalysis.detectedSkills || [],
        skillGap.missingSkills || [],
        aiAnalysis.atsScore,
        projects || []
      );
      const difficultyMetadata = difficultyEngine.generateDifficultyMetadata(
        candidateProfile,
        aiAnalysis.atsScore
      );
      interviewPrep = await aiAnalyzer.generateInterviewQuestions(
        extractedText,
        {
          score: aiAnalysis.atsScore,
          strengths: aiAnalysis.strengths,
          weaknesses: aiAnalysis.weaknesses,
          recommendations: aiAnalysis.recommendations
        },
        scoreAnalysis.detectedSkills || [],
        targetRole || 'Software Engineer',
        skillGap.missingSkills || [],
        candidateProfile,
        difficultyMetadata
      );
    } catch (ipErr) {
      logger.error('Pipeline', `Failed to generate interview prep in pipeline: ${ipErr.message}`);
      interviewPrep = aiAnalyzer.getMockInterviewQuestions(
        targetRole,
        scoreAnalysis.detectedSkills || [],
        skillGap.missingSkills || [],
        extractedText
      );
    }

    // 7. Generate secure cryptographically random UUID for analysis ID and save
    const analysisId = `analysis_${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const record = {
      userId: userId,
      resumeName: originalname,
      resumeFileName: originalname,
      targetRole: targetRole,
      score: scoreAnalysis.overallScore,
      atsScore: scoreAnalysis.overallScore,
      breakdown: scoreAnalysis.breakdown,
      explanations: scoreAnalysis.explanations,
      strengths: aiAnalysis.strengths,
      weaknesses: aiAnalysis.weaknesses,
      recommendations: aiAnalysis.recommendations,
      atsTips: [
        'Use standard section headings like "Work Experience", "Education", and "Skills".',
        'Avoid using graphics, text boxes, charts, or images which cannot be read by ATS scanners.',
        'Describe your achievements using the Action Verb + Task + Result formula.'
      ],
      rewriteSuggestions: aiAnalysis.recommendations,
      missingKeywords: aiAnalysis.missingKeywords,
      missingSections: scoreAnalysis.missingSections || [],
      recruiterFeedback: aiAnalysis.roleFit,
      skillGap: skillGap,
      interviewPrep: interviewPrep,
      extractedText: extractedText,
      extractedResumeText: extractedText,
      detectedSkills: scoreAnalysis.detectedSkills || [],
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
      targetRole: targetRole,
      score: scoreAnalysis.overallScore,
      atsScore: scoreAnalysis.overallScore,
      breakdown: scoreAnalysis.breakdown,
      explanations: scoreAnalysis.explanations,
      strengths: aiAnalysis.strengths,
      weaknesses: aiAnalysis.weaknesses,
      recommendations: aiAnalysis.recommendations,
      atsTips: [
        'Use standard section headings like "Work Experience", "Education", and "Skills".',
        'Avoid using graphics, text boxes, charts, or images which cannot be read by ATS scanners.',
        'Describe your achievements using the Action Verb + Task + Result formula.'
      ],
      rewriteSuggestions: aiAnalysis.recommendations,
      missingKeywords: aiAnalysis.missingKeywords,
      missingSections: scoreAnalysis.missingSections,
      recruiterFeedback: aiAnalysis.roleFit,
      skillGap: skillGap || null,
      interviewPrep: interviewPrep || null,
      extractedText: extractedText,
      extractedResumeText: extractedText,
      detectedSkills: scoreAnalysis.detectedSkills || [],
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
  const userId = req.user ? req.user.uid : 'anonymous';
  
  try {
    let { resumeText, targetRole, analysisId, detectedSkills } = req.body;
    
    let dbRecord = null;
    if (analysisId) {
      try {
        dbRecord = await firebaseService.getAnalysisById(analysisId);
        if (dbRecord) {
          if (!targetRole) {
            targetRole = dbRecord.targetRole || (dbRecord.skillGap && dbRecord.skillGap.targetRole);
          }
          if ((!detectedSkills || detectedSkills.length === 0) && dbRecord.detectedSkills) {
            detectedSkills = dbRecord.detectedSkills;
          }
          if (!resumeText && (dbRecord.extractedResumeText || dbRecord.extractedText)) {
            resumeText = dbRecord.extractedResumeText || dbRecord.extractedText;
          }
        }
      } catch (dbErr) {
        logger.error('SkillGap', `Failed to load details from analysis record: ${dbErr.message}`);
      }
    }

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
      result = await aiAnalyzer.analyzeSkillGap(resumeText, targetRole, detectedSkills || []);
      logger.info('SkillGap', '✅ Skill gap analysis completed successfully.');
    } catch (aiError) {
      logger.error('SkillGap', `Skill Gap Analysis Error: ${aiError.message}`);
      const error = new Error('Failed to complete skill gap analysis.');
      error.statusCode = 500;
      error.code = 'AI_ANALYSIS_ERROR';
      return next(error);
    }

    // Persist to DB if analysisId is active
    if (analysisId && dbRecord) {
      try {
        if (dbRecord.userId === userId || userId === 'anonymous') {
          dbRecord.targetRole = targetRole; // Unify context: save to root targetRole
          dbRecord.skillGap = {
            targetRole,
            matchedSkills: result.matchedSkills,
            missingSkills: result.missingSkills,
            recommendedSkills: result.recommendedSkills,
            learningRoadmap: result.learningRoadmap
          };
          await firebaseService.saveAnalysis(analysisId, dbRecord);
          logger.info('SkillGap', `💾 Successfully persisted skill gap results in DB for analysisId: ${analysisId}`);
        }
      } catch (dbErr) {
        logger.error('SkillGap', `Failed to save skill gap results to DB: ${dbErr.message}`);
      }
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
  const userId = req.user ? req.user.uid : 'anonymous';
  
  try {
    let { resumeText, analysisId, atsAnalysis, detectedSkills, targetRole, missingSkills } = req.body;
    
    let dbRecord = null;
    if (analysisId) {
      try {
        dbRecord = await firebaseService.getAnalysisById(analysisId);
        if (dbRecord) {
          if (!targetRole) {
            targetRole = dbRecord.targetRole || (dbRecord.skillGap && dbRecord.skillGap.targetRole);
          }
          if ((!missingSkills || missingSkills.length === 0) && dbRecord.skillGap && dbRecord.skillGap.missingSkills) {
            missingSkills = dbRecord.skillGap.missingSkills;
          }
          if ((!detectedSkills || detectedSkills.length === 0) && dbRecord.detectedSkills) {
            detectedSkills = dbRecord.detectedSkills;
          }
          if (!resumeText && (dbRecord.extractedResumeText || dbRecord.extractedText)) {
            resumeText = dbRecord.extractedResumeText || dbRecord.extractedText;
          }
          if (!atsAnalysis) {
            atsAnalysis = {
              score: dbRecord.atsScore || dbRecord.score || 0,
              strengths: dbRecord.strengths || [],
              weaknesses: dbRecord.weaknesses || [],
              recommendations: dbRecord.recommendations || []
            };
          }
        }
      } catch (dbErr) {
        logger.error('InterviewPrep', `Failed to load details from analysis record: ${dbErr.message}`);
      }
    }

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

    // Check Phase 6 Validation Requirements: targetRole, detectedSkills, and projects must not be missing
    const projects = aiAnalyzer.extractProjectsFromText(resumeText);
    
    if (
      !targetRole || typeof targetRole !== 'string' || targetRole.trim() === '' ||
      !detectedSkills || !Array.isArray(detectedSkills) || detectedSkills.length === 0 ||
      !projects || projects.length === 0
    ) {
      logger.error('InterviewPrep', 'Validation Error: targetRole, detectedSkills, or projects are missing.');
      const error = new Error('Interview preparation data unavailable.');
      error.statusCode = 400;
      error.code = 'PREPARATION_DATA_UNAVAILABLE';
      return next(error);
    }

    logger.info('InterviewPrep', `📄 Resume text length: ${resumeText.length}`);

    // Generate Candidate Profile in-memory
    const candidateProfile = candidateProfiler.buildCandidateProfile(
      resumeText,
      targetRole || 'Software Engineer',
      detectedSkills || [],
      missingSkills || [],
      atsAnalysis?.score || atsAnalysis?.atsScore || 0,
      projects || []
    );

    logger.info('InterviewPrep', '👤 Generated internal candidate profile:', JSON.stringify(candidateProfile));

    // Generate Adaptive Difficulty metadata
    const difficultyMetadata = difficultyEngine.generateDifficultyMetadata(
      candidateProfile,
      atsAnalysis?.score || atsAnalysis?.atsScore || 0
    );

    logger.info('InterviewPrep', '⚙️ Generated internal difficulty metadata:', JSON.stringify(difficultyMetadata));

    // Generate Interview Questions
    logger.info('InterviewPrep', '🤖 Requesting AI interview questions...');
    let result;
    try {
      result = await aiAnalyzer.generateInterviewQuestions(
        resumeText, 
        atsAnalysis || null, 
        detectedSkills || [], 
        targetRole || 'Software Engineer', 
        missingSkills || [],
        candidateProfile,
        difficultyMetadata
      );
      logger.info('InterviewPrep', '✅ Interview questions generated successfully.');
    } catch (aiError) {
      logger.error('InterviewPrep', `Interview Questions Error: ${aiError.message}`);
      const error = new Error('Failed to generate interview questions.');
      error.statusCode = 500;
      error.code = 'AI_ANALYSIS_ERROR';
      return next(error);
    }

    // Persist to DB if analysisId is active
    if (analysisId && dbRecord) {
      try {
        if (dbRecord.userId === userId || userId === 'anonymous') {
          dbRecord.targetRole = targetRole; // Unify context: save to root targetRole
          dbRecord.interviewPrep = {
            technical: result.technical,
            projectBased: result.projectBased,
            skillGap: result.skillGap,
            behavioral: result.behavioral,
            hrQuestions: result.hrQuestions
          };
          await firebaseService.saveAnalysis(analysisId, dbRecord);
          logger.info('InterviewPrep', `💾 Successfully persisted interview questions in DB for analysisId: ${analysisId}`);
        }
      } catch (dbErr) {
        logger.error('InterviewPrep', `Failed to save interview questions to DB: ${dbErr.message}`);
      }
    }

    const duration = Date.now() - startTime;
    logger.info('InterviewPrep', `⏱️ Interview questions generation completed in ${duration}ms.`);

    return res.status(200).json({
      success: true,
      technical: result.technical,
      projectBased: result.projectBased,
      skillGap: result.skillGap,
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
