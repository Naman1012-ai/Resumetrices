/**
 * @file resumeRoutes.js
 * @description Defines routing for resume-related API endpoints.
 * Integrates rate limiter, authorization middleware, and controllers.
 */

const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const upload = require('../middleware/upload');
const requireAuth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');

// POST /api/upload - Handle resume upload and comprehensive pipeline analysis
router.post('/upload', requireAuth, rateLimiter('upload'), upload.single('resume'), resumeController.analyzeResume);

// POST /api/analyze - Alias route for complete pipeline analysis
router.post('/analyze', requireAuth, rateLimiter('upload'), upload.single('resume'), resumeController.analyzeResume);

// GET /api/history - Fetch past analysis summaries for the logged-in user
router.get('/history', requireAuth, rateLimiter('general'), resumeController.getAnalysisHistory);

// GET /api/dashboard/stats - Fetch aggregated stats and recent uploader for user dashboard
router.get('/dashboard/stats', requireAuth, rateLimiter('general'), resumeController.getDashboardStats);

// GET /api/analysis/:id - Fetch full analysis details by analysis ID
router.get('/analysis/:id', requireAuth, rateLimiter('general'), resumeController.getAnalysisById);

// DELETE /api/analysis/:id - Delete a single analysis record by ID
router.delete('/analysis/:id', requireAuth, rateLimiter('general'), resumeController.deleteAnalysis);

// POST /api/skills/gap - Skill gap comparison against a target role
router.post('/skills/gap', requireAuth, rateLimiter('general'), resumeController.analyzeSkillGap);

// POST /api/interview/questions - Personalized interview questions generator
router.post('/interview/questions', requireAuth, rateLimiter('general'), resumeController.generateInterviewQuestions);

// GET /api/resumes/history - Legacy history endpoint for backwards compatibility
router.get('/resumes/history', requireAuth, rateLimiter('general'), resumeController.getUploadHistory);

module.exports = router;
