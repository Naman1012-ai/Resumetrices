/**
 * @file maintenance.js
 * @description Middleware to block standard users and consumer routes when maintenance mode is active.
 * Bypasses all admin interfaces, admin APIs, diagnostic paths, and configuration utilities.
 */

const logger = require('../utils/logger');

// Shared global state for guardrail parameters (accessible inside limiter and upload middlewares)
global.guardrails = global.guardrails || {
  maintenanceMode: false,
  rateLimitMax: 60,
  maxFileSize: 5 * 1024 * 1024 // 5 MB default
};

const maintenanceMiddleware = (req, res, next) => {
  const path = req.path;

  // Bypasses: admin views, admin APIs, env configuration, admin assets
  const isAdminRoute = path.startsWith('/admin') || path.startsWith('/api/admin');
  const isConfigRoute = path === '/env-config.js';
  const isAdminAsset = path === '/css/admin.css' || path === '/js/firebase-config.js' || path === '/logo.png';

  if (isAdminRoute || isConfigRoute || isAdminAsset) {
    return next();
  }

  // If maintenance mode is active, reject standard traffic
  if (global.guardrails.maintenanceMode) {
    // 1. Consumer-facing API routes block
    if (path.startsWith('/api')) {
      logger.warn('Maintenance', `Blocked incoming API request to ${path} during active maintenance mode.`);
      return res.status(503).json({
        success: false,
        message: 'System undergoing scheduled optimization. Back shortly!'
      });
    }

    // 2. Standard user HTML views block
    const userPages = [
      '/', '/index.html', '/dashboard', '/dashboard.html', 
      '/history.html', '/interview.html', '/roadmap.html', 
      '/settings.html', '/skill-gap.html', '/profile.html',
      '/new-analysis.html', '/login.html', '/signup.html', '/analysis.html'
    ];

    if (userPages.includes(path) || path.endsWith('.html') || path === '/') {
      logger.warn('Maintenance', `Rendered Scheduled Optimization page for path: ${path}`);
      res.setHeader('Retry-After', '3600'); // retry in 1 hour
      return res.status(503).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Scheduled Optimization - Resumetrices</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg-primary: #020617;
              --text-main: #f8fafc;
              --text-muted: #94a3b8;
              --rose: #f43f5e;
              --border-color: rgba(148, 163, 184, 0.12);
            }
            body {
              margin: 0;
              padding: 0;
              background-color: var(--bg-primary);
              color: var(--text-main);
              font-family: 'Outfit', sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              overflow: hidden;
              position: relative;
            }
            .glow {
              position: absolute;
              width: 500px;
              height: 500px;
              background: radial-gradient(circle, rgba(244, 63, 94, 0.05) 0%, transparent 70%);
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              z-index: 1;
            }
            .card {
              background: rgba(15, 23, 42, 0.45);
              border: 1px solid var(--border-color);
              backdrop-filter: blur(12px);
              border-radius: 24px;
              padding: 3rem 2rem;
              max-width: 480px;
              width: 90%;
              text-align: center;
              box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
              z-index: 2;
              animation: scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes scaleIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
            .icon {
              font-size: 3.5rem;
              margin-bottom: 1.5rem;
              animation: pulse 2s infinite alternate;
              display: inline-block;
            }
            @keyframes pulse {
              0% { transform: scale(1); }
              100% { transform: scale(1.08); }
            }
            h1 {
              font-size: 1.75rem;
              font-weight: 800;
              margin: 0 0 1rem 0;
              line-height: 1.3;
              background: linear-gradient(135deg, #fff 30%, var(--text-muted));
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            p {
              font-size: 0.95rem;
              color: var(--text-muted);
              line-height: 1.6;
              margin: 0 0 2rem 0;
            }
            .badge {
              background: rgba(244, 63, 94, 0.12);
              color: var(--rose);
              padding: 0.4rem 1rem;
              border-radius: 99px;
              font-size: 0.75rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="glow"></div>
          <div class="card">
            <div class="icon">⚙️</div>
            <h1>System undergoing scheduled optimization.<br>Back shortly!</h1>
            <p>We are running diagnostic updates to optimize extraction velocity and scaling limits. Standard services will resume shortly.</p>
            <div class="badge">Optimization In Progress</div>
          </div>
        </body>
        </html>
      `);
    }
  }

  next();
};

module.exports = {
  maintenanceMiddleware
};
