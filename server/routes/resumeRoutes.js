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

// POST /api/public/analyze - Public endpoint for guest users (bypasses auth checks)
router.post('/public/analyze', rateLimiter('upload'), upload.single('resume'), resumeController.analyzePublicResume);

// GET /api/public/stats - Fetch global public database statistics for the landing page
router.get('/public/stats', rateLimiter('general'), resumeController.getPublicStats);

// GET /api/history - Fetch past analysis summaries for the logged-in user
router.get('/history', requireAuth, rateLimiter('general'), resumeController.getAnalysisHistory);

// GET /api/dashboard/stats - Fetch aggregated stats and recent uploader for user dashboard
router.get('/dashboard/stats', requireAuth, rateLimiter('general'), resumeController.getDashboardStats);

// GET /api/analysis/:id - Fetch full analysis details by analysis ID
router.get('/analysis/:id', requireAuth, rateLimiter('general'), resumeController.getAnalysisById);

// DELETE /api/analysis/:id - Delete a single analysis record by ID
router.delete('/analysis/:id', requireAuth, rateLimiter('general'), resumeController.deleteAnalysis);

// PUT /api/analysis/:id/rename - Rename a single analysis record by ID
router.put('/analysis/:id/rename', requireAuth, rateLimiter('general'), resumeController.renameAnalysis);

// POST /api/skills/gap - Skill gap comparison against a target role
router.post('/skills/gap', requireAuth, rateLimiter('general'), resumeController.analyzeSkillGap);

// POST /api/interview/questions - Personalized interview questions generator
router.post('/interview/questions', requireAuth, rateLimiter('general'), resumeController.generateInterviewQuestions);

// GET /api/resumes/history - Legacy history endpoint for backwards compatibility
router.get('/resumes/history', requireAuth, rateLimiter('general'), resumeController.getUploadHistory);

// DELETE /api/user - Complete user account data purge
router.delete('/user', requireAuth, rateLimiter('general'), resumeController.deleteUserAccount);

// DELETE /api/users/profile - Complete user account data purge (alias)
router.delete('/users/profile', requireAuth, rateLimiter('general'), resumeController.deleteUserAccount);

module.exports = router;
