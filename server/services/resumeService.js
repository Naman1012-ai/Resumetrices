/**
 * @file resumeService.js
 * @description Service layer orchestrating resume analysis pipeline, skill gap comparison, and interview preparation.
 */

const fs = require('fs');
const crypto = require('crypto');
const pdfParser = require('./pdfParser');
const firebaseService = require('./firebaseService');
const atsScorer = require('./atsScorer');
const aiAnalyzer = require('./aiAnalyzer');
const candidateProfiler = require('./candidateProfiler');
const difficultyEngine = require('./difficultyEngine');
const aiResponseValidator = require('./aiResponseValidator');
const constants = require('../config/constants');
const env = require('../config/env');
const logger = require('../utils/logger');


/**
 * Stage 1-7: Complete resume analysis pipeline.
 */
async function processResumeAnalysis(userId, file, targetRole, onProgress) {
  const { path: filePath, originalname } = file;

  // 1. Validate targetRole
  if (!targetRole || typeof targetRole !== 'string' || targetRole.trim() === '') {
    const error = new Error('Please upload a resume and select a target job role before starting the analysis.');
    error.statusCode = 400;
    error.code = 'MISSING_TARGET_ROLE';
    throw error;
  }

  // 2. Text Extraction
  let extractedText;
  try {
    extractedText = await pdfParser.extractText(filePath);
    if (onProgress) onProgress({ stage: 'extracting', label: 'Detecting Skills', percent: 10 });
  } catch (parseError) {
    logger.error('Pipeline', `Parsing Error: ${parseError.message}`);
    const error = new Error('Failed to parse PDF content. Ensure the file is not corrupted.');
    error.statusCode = 422;
    error.code = 'PARSING_ERROR';
    throw error;
  }

  // Validate text length
  if (!extractedText || extractedText.trim().length < 100) {
    const error = new Error('We could not read text from your PDF. It may be a scanned image or a corrupted file. Please try a different PDF.');
    error.statusCode = 400;
    error.code = 'EXTRACTION_FAILED';
    throw error;
  }

  if (extractedText.length > constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH) {
    const error = new Error(`Resume text length exceeds maximum limit of ${constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH} characters.`);
    error.statusCode = 400;
    error.code = 'TEXT_TOO_LONG';
    throw error;
  }

  // 3. Document Type Classification
  let classification;
  try {
    classification = await aiAnalyzer.classifyDocument(extractedText);
  } catch (classError) {
    logger.error('Pipeline', `Document classification failed: ${classError.message}`);
    classification = { documentType: 'unknown', confidence: 0 };
  }

  if (classification.documentType === 'unknown') {
    const error = new Error("This doesn't appear to be a resume. Please upload a resume PDF.");
    error.statusCode = 400;
    error.code = 'INVALID_DOCUMENT_TYPE';
    error.documentType = 'unknown';
    throw error;
  }

  // 4. Realistic Rule-Based ATS Scoring
  let scoreAnalysis;
  try {
    scoreAnalysis = atsScorer.scoreResume(extractedText, targetRole);
    if (onProgress) onProgress({ stage: 'scoring', label: 'Calculating ATS Score', percent: 20 });
  } catch (scoreError) {
    logger.error('Pipeline', `Scoring Error: ${scoreError.message}`);
    const error = new Error('Failed to calculate ATS score.');
    error.statusCode = 500;
    error.code = 'SCORING_ERROR';
    throw error;
  }

  // 5. AI Analysis via Google Gemini / OpenAI Fallback
  let aiAnalysis;
  try {
    aiAnalysis = await aiAnalyzer.analyzeResumeText(extractedText, targetRole, scoreAnalysis);
    if (onProgress) onProgress({ stage: 'ai_analysis', label: 'Running AI Resume Analysis', percent: 50 });
  } catch (aiError) {
    logger.error('Pipeline', `AI Analysis failed: ${aiError.message}`);
    const isInvalid = aiError.message.includes('AI_RESPONSE_INVALID') || 
                      (aiError.originalError && aiError.originalError.message.includes('AI_RESPONSE_INVALID'));
    if (isInvalid) {
      throw new Error('AI_RESPONSE_INVALID');
    }
    const msg = aiError.originalError ? aiError.originalError.message : aiError.message;
    const userErr = new Error(msg);
    userErr.statusCode = 500;
    userErr.code = 'AI_ANALYSIS_FAILED';
    throw userErr;
  }

  // 6. Generate Skill Gap and Interview Prep for the record
  let skillGap = null;
  let interviewPrep = null;
  try {
    skillGap = await aiAnalyzer.analyzeSkillGap(extractedText, targetRole, scoreAnalysis.detectedSkills || []);
    if (onProgress) onProgress({ stage: 'skill_gap', label: 'Generating Skill Gap', percent: 65 });
    if (skillGap) {
      skillGap.targetRole = targetRole;
    }
  } catch (sgErr) {
    logger.error('Pipeline', `Skill Gap failed: ${sgErr.message}`);
    const isInvalid = sgErr.message.includes('AI_RESPONSE_INVALID') || 
                      (sgErr.originalError && sgErr.originalError.message.includes('AI_RESPONSE_INVALID'));
    if (isInvalid) {
      throw new Error('AI_RESPONSE_INVALID');
    }
    const msg = sgErr.originalError ? sgErr.originalError.message : sgErr.message;
    const userErr = new Error(msg);
    userErr.statusCode = 500;
    userErr.code = 'AI_ANALYSIS_FAILED';
    throw userErr;
  }

  try {
    const projects = aiAnalyzer.extractProjectsFromText(extractedText);
    const candidateProfile = candidateProfiler.buildCandidateProfile(
      extractedText,
      targetRole || 'Software Engineer',
      scoreAnalysis.detectedSkills || [],
      skillGap.missingSkills || [],
      scoreAnalysis.overallScore,
      projects || []
    );
    const difficultyMetadata = difficultyEngine.generateDifficultyMetadata(
      candidateProfile,
      scoreAnalysis.overallScore
    );
    if (onProgress) onProgress({ stage: 'profiling', label: 'Building Candidate Profile', percent: 70 });
    interviewPrep = await aiAnalyzer.generateInterviewQuestions(
      extractedText,
      {
        score: scoreAnalysis.overallScore,
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
    if (onProgress) onProgress({ stage: 'interview', label: 'Preparing Interview Questions', percent: 78 });
  } catch (ipErr) {
    logger.error('Pipeline', `Interview Prep failed: ${ipErr.message}`);
    const isInvalid = ipErr.message.includes('AI_RESPONSE_INVALID') || 
                      (ipErr.originalError && ipErr.originalError.message.includes('AI_RESPONSE_INVALID'));
    if (isInvalid) {
      throw new Error('AI_RESPONSE_INVALID');
    }
    const msg = ipErr.originalError ? ipErr.originalError.message : ipErr.message;
    const userErr = new Error(msg);
    userErr.statusCode = 500;
    userErr.code = 'AI_ANALYSIS_FAILED';
    throw userErr;
  }

  // 7. Save Analysis record
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
    weights: scoreAnalysis.weights,
    isMismatched: scoreAnalysis.isMismatched,
    compatibilityLabel: scoreAnalysis.compatibilityLabel,
    justifications: scoreAnalysis.justifications,
    explanations: aiAnalysis.categoryExplanations || {},
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
    resumeText: extractedText,
    detectedSkills: scoreAnalysis.detectedSkills || [],
    createdAt: createdAt
  };

  // Perform Consolidated Record Business Integrity Check
  if (!aiResponseValidator.validateConsolidatedRecord(record)) {
    logger.error('Pipeline', '❌ Consolidated record failed validation integrity check.');
    const error = new Error('Analysis could not be generated due to system integrity check failure.');
    error.statusCode = 500;
    error.code = 'INTEGRITY_CHECK_FAILED';
    throw error;
  }
  if (onProgress) onProgress({ stage: 'validation', label: 'Validating Results', percent: 88 });

  logger.info('Pipeline', `💾 Saving results to Firebase under ID: ${analysisId}...`);
  try {
    await firebaseService.saveAnalysis(analysisId, record);
    logger.info('Pipeline', '✅ Saved to Firebase successfully.');
    if (onProgress) onProgress({ stage: 'saving', label: 'Saving Analysis', percent: 95 });
  } catch (dbError) {
    logger.error('Pipeline', `Database Write Error: ${dbError.message}`);
    const error = new Error('Failed to save analysis record to database.');
    error.statusCode = 500;
    error.code = 'DATABASE_WRITE_ERROR';
    throw error;
  }

  if (onProgress) onProgress({ stage: 'complete', label: 'Done', percent: 100 });
  return {
    analysisId,
    record
  };
}

/**
 * Handle skill gap analysis logic (both standalone and persistent context).
 */
async function processSkillGapAnalysis(userId, body) {
  let { resumeText, targetRole, analysisId, detectedSkills } = body;
  
  let dbRecord = null;
  if (analysisId) {
    dbRecord = await firebaseService.getAnalysisById(analysisId);
    if (!dbRecord) {
      const error = new Error('Analysis record not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    // Ownership check
    const isDev = env.IS_DEV;
    if (dbRecord.userId !== userId && !(isDev && userId === 'anonymous')) {
      logger.warn('SkillGap', `Access denied: User ${userId} requested record owned by ${dbRecord.userId}`);
      const error = new Error('Access denied. You are not authorized to view this analysis.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    if (!targetRole) {
      targetRole = dbRecord.targetRole || (dbRecord.skillGap && dbRecord.skillGap.targetRole);
    }
    if ((!detectedSkills || detectedSkills.length === 0) && dbRecord.detectedSkills) {
      detectedSkills = dbRecord.detectedSkills;
    }
    if (!resumeText && (dbRecord.resumeText || dbRecord.extractedResumeText || dbRecord.extractedText)) {
      resumeText = dbRecord.resumeText || dbRecord.extractedResumeText || dbRecord.extractedText;
    }
  }

  // Request Validation
  if (!targetRole || typeof targetRole !== 'string' || targetRole.trim() === '') {
    const error = new Error('Target role is required and must be a non-empty string.');
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }
  
  if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
    const error = new Error('Resume text content is required.');
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  if (resumeText.length > constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH) {
    const error = new Error(`Resume text content exceeds maximum limit of ${constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH} characters.`);
    error.statusCode = 400;
    error.code = 'TEXT_TOO_LONG';
    throw error;
  }

  // Perform AI Skill Gap Analysis
  let result;
  try {
    result = await aiAnalyzer.analyzeSkillGap(resumeText, targetRole, detectedSkills || []);
  } catch (aiError) {
    logger.error('SkillGap', `Skill Gap Analysis Error: ${aiError.message}`);
    const error = new Error('Analysis could not be generated. Please try again.');
    error.statusCode = 500;
    error.code = 'AI_ANALYSIS_ERROR';
    throw error;
  }

  // Save if analysisId is active
  if (analysisId && dbRecord) {
    try {
      const isDev = env.IS_DEV;
      if (dbRecord.userId === userId || (isDev && userId === 'anonymous')) {
        dbRecord.targetRole = targetRole;
        dbRecord.skillGap = {
          targetRole,
          matchedSkills: result.matchedSkills,
          missingSkills: result.missingSkills,
          recommendedSkills: result.recommendedSkills,
          learningRoadmap: result.learningRoadmap
        };
        await firebaseService.saveAnalysis(analysisId, dbRecord);
      }
    } catch (dbErr) {
      logger.error('SkillGap', `Failed to save skill gap results to DB: ${dbErr.message}`);
    }
  }

  return {
    matchedSkills: result.matchedSkills,
    missingSkills: result.missingSkills,
    recommendedSkills: result.recommendedSkills,
    learningRoadmap: result.learningRoadmap
  };
}

/**
 * Handle interview preparation questions logic.
 */
async function processInterviewQuestions(userId, body) {
  let { resumeText, analysisId, atsAnalysis, detectedSkills, targetRole, missingSkills } = body;
  
  let dbRecord = null;
  if (analysisId) {
    dbRecord = await firebaseService.getAnalysisById(analysisId);
    if (!dbRecord) {
      const error = new Error('Analysis record not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    // Ownership check
    const isDev = env.IS_DEV;
    if (dbRecord.userId !== userId && !(isDev && userId === 'anonymous')) {
      logger.warn('InterviewPrep', `Access denied: User ${userId} requested record owned by ${dbRecord.userId}`);
      const error = new Error('Access denied. You are not authorized to view this analysis.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    if (!targetRole) {
      targetRole = dbRecord.targetRole || (dbRecord.skillGap && dbRecord.skillGap.targetRole);
    }
    if ((!missingSkills || missingSkills.length === 0) && dbRecord.skillGap && dbRecord.skillGap.missingSkills) {
      missingSkills = dbRecord.skillGap.missingSkills;
    }
    if ((!detectedSkills || detectedSkills.length === 0) && dbRecord.detectedSkills) {
      detectedSkills = dbRecord.detectedSkills;
    }
    if (!resumeText && (dbRecord.resumeText || dbRecord.extractedResumeText || dbRecord.extractedText)) {
      resumeText = dbRecord.resumeText || dbRecord.extractedResumeText || dbRecord.extractedText;
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

  const isStandalone = !analysisId && targetRole;
  
  if (isStandalone) {
    if (!resumeText) resumeText = "Standalone Mode";
    if (!detectedSkills) detectedSkills = [];
    if (!missingSkills) missingSkills = [];
  } else {
    // Request Validation
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      const error = new Error('Resume text content is required.');
      error.statusCode = 400;
      error.code = 'INVALID_INPUT';
      throw error;
    }

    if (resumeText.length > constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH) {
      const error = new Error(`Resume text content exceeds maximum limit of ${constants.BODY_LIMITS.RESUME_TEXT_MAX_LENGTH} characters.`);
      error.statusCode = 400;
      error.code = 'TEXT_TOO_LONG';
      throw error;
    }
  }

  const projects = isStandalone ? [] : aiAnalyzer.extractProjectsFromText(resumeText);
  
  if (!isStandalone) {
    if (
      !targetRole || typeof targetRole !== 'string' || targetRole.trim() === '' ||
      !detectedSkills || !Array.isArray(detectedSkills) || detectedSkills.length === 0 ||
      !projects || projects.length === 0
    ) {
      const error = new Error('Interview preparation data unavailable.');
      error.statusCode = 400;
      error.code = 'PREPARATION_DATA_UNAVAILABLE';
      throw error;
    }
  }

  const candidateProfile = isStandalone ? null : candidateProfiler.buildCandidateProfile(
    resumeText,
    targetRole || 'Software Engineer',
    detectedSkills || [],
    missingSkills || [],
    atsAnalysis?.score || atsAnalysis?.atsScore || 0,
    projects || []
  );

  const difficultyMetadata = isStandalone
    ? difficultyEngine.generateStandaloneDifficulty(targetRole)
    : difficultyEngine.generateDifficultyMetadata(
        candidateProfile,
        atsAnalysis?.score || atsAnalysis?.atsScore || 0
      );

  // Generate Interview Questions
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
  } catch (aiError) {
    logger.error('InterviewPrep', `Interview Questions Error: ${aiError.message}`);
    const error = new Error('Analysis could not be generated. Please try again.');
    error.statusCode = 500;
    error.code = 'AI_ANALYSIS_ERROR';
    throw error;
  }

  // Persist if analysisId is active
  if (analysisId && dbRecord) {
    try {
      const isDev = env.IS_DEV;
      if (dbRecord.userId === userId || (isDev && userId === 'anonymous')) {
        dbRecord.targetRole = targetRole;
        dbRecord.interviewPrep = {
          technical: result.technical,
          projectBased: result.projectBased,
          skillGap: result.skillGap || null,
          domainKnowledge: result.domainKnowledge || null,
          behavioral: result.behavioral,
          hrQuestions: result.hrQuestions,
          gradingRubric: result.gradingRubric || null
        };
        await firebaseService.saveAnalysis(analysisId, dbRecord);
      }
    } catch (dbErr) {
      logger.error('InterviewPrep', `Failed to save interview questions to DB: ${dbErr.message}`);
    }
  }

  return {
    technical: result.technical,
    projectBased: result.projectBased,
    skillGap: result.skillGap || null,
    domainKnowledge: result.domainKnowledge || null,
    behavioral: result.behavioral,
    hrQuestions: result.hrQuestions,
    gradingRubric: result.gradingRubric || null
  };
}

module.exports = {
  processResumeAnalysis,
  processSkillGapAnalysis,
  processInterviewQuestions
};
