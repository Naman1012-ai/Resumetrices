/**
 * @file adminRoutes.js
 * @description Routes for administrative operations. Secured by requireAdmin middleware.
 */

const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/adminAuth');
const firebaseService = require('../services/firebaseService');
const rateLimiter = require('../middleware/rateLimiter');

// GET /api/admin/stats - Retrieve administrative system statistics
router.get('/stats', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    // Fetch global admin statistics
    const stats = await firebaseService.getAdminDashboardStats();
    res.status(200).json({
      success: true,
      stats: stats
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users - Retrieve full user directory listing
router.get('/users', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    const users = await firebaseService.getAdminUserList();
    res.status(200).json({
      success: true,
      users: users
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:userId/quota - Update a user's tier/quota/domain profile flags
router.put('/users/:userId/quota', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { tier, quota, domain } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId parameter is required.' });
    }

    // Validate tier if provided
    const validTiers = ['free', 'pro', 'enterprise'];
    if (tier && !validTiers.includes(tier)) {
      return res.status(400).json({ success: false, message: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
    }

    // Validate quota if provided
    if (quota !== undefined) {
      const parsedQuota = parseInt(quota, 10);
      if (isNaN(parsedQuota) || parsedQuota < 0 || parsedQuota > 500) {
        return res.status(400).json({ success: false, message: 'Quota must be between 0 and 500.' });
      }
    }

    await firebaseService.updateUserQuota(userId, { tier, quota, domain });
    res.status(200).json({
      success: true,
      message: `User ${userId} profile updated successfully.`
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/reports - Retrieve all processing runs/reports across the platform
router.get('/reports', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    const reports = await firebaseService.getAdminReports();
    res.status(200).json({
      success: true,
      reports: reports
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/reports/:id - Retrieve full details of a specific report
router.get('/reports/:id', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await firebaseService.getAdminReportDetails(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Report ${id} not found.`
      });
    }
    res.status(200).json({
      success: true,
      report: report
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/guardrails - Fetch active security guardrails parameters
router.get('/guardrails', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    const config = await firebaseService.getGuardrailsConfig();
    res.status(200).json({
      success: true,
      config: config
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/guardrails - Deploy/update active security guardrails parameters
router.post('/guardrails', requireAdmin, rateLimiter('general'), async (req, res, next) => {
  try {
    const { maintenanceMode, rateLimitMax, maxFileSize } = req.body;

    // Input boundary validations
    if (rateLimitMax !== undefined) {
      const limit = parseInt(rateLimitMax, 10);
      if (isNaN(limit) || limit < 10 || limit > 200) {
        return res.status(400).json({
          success: false,
          message: 'Rate limit threshold must be between 10 and 200 requests per minute.'
        });
      }
    }

    const validSizes = [2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024, 20 * 1024 * 1024];
    if (maxFileSize !== undefined) {
      const size = parseInt(maxFileSize, 10);
      if (!validSizes.includes(size)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid max file size boundary. Must be 2 MB, 5 MB, 10 MB, or 20 MB.'
        });
      }
    }

    await firebaseService.updateGuardrailsConfig({
      maintenanceMode,
      rateLimitMax,
      maxFileSize
    });

    res.status(200).json({
      success: true,
      message: 'Security guardrail parameters deployed successfully.',
      config: global.guardrails
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
