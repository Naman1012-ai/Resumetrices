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

module.exports = router;
