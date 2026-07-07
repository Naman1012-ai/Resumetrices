/**
 * @file app.js
 * @description Configures the Express application, including CORS, security headers,
 * body parser limits, static file routes, API routing, and centralized error handling.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const constants = require('./config/constants');
const logger = require('./utils/logger');
const env = require('./config/env');

console.log('[Startup] Loading routes...');
const resumeRoutes = require('./routes/resumeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Secure application by setting various HTTP headers via Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://www.gstatic.com",
        "https://apis.google.com",
        "https://cdnjs.cloudflare.com",
        "https://accounts.google.com"
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: [
        "'self'",
        "https://*.firebaseio.com",
        "https://*.firebasedatabase.app",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://accounts.google.com",
        "https://oauth2.googleapis.com",
        "https://openidconnect.googleapis.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://ui-avatars.com",
        "https://*.googleusercontent.com"
      ],
      frameSrc: ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com"],
      objectSrc: ["'none'"]
    }
  }
}));

// Enable trust proxy for correct IP identification behind reverse proxies (for rate limiting)
app.set('trust proxy', 1);

// Enable Cross-Origin Resource Sharing (CORS) with dynamic same-origin support
const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');
  let corsOptions = {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  };

  if (!origin) {
    corsOptions.origin = true;
  } else {
    const clientUrl = env.CLIENT_URL;
    const reqHost = req.get('host');
    const sameOriginHttp = `http://${reqHost}`;
    const sameOriginHttps = `https://${reqHost}`;
    
    const isSameOrigin = origin === sameOriginHttp || origin === sameOriginHttps;
    const isConfiguredOrigin = clientUrl === '*' || origin === clientUrl;
    const isLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin === 'null';

    if (isSameOrigin || isConfiguredOrigin || (env.IS_DEV && isLocal)) {
      corsOptions.origin = true;
    } else {
      corsOptions.origin = false; // Block CORS in browser without throwing express 500 error
    }
  }

  callback(null, corsOptions);
};
app.use(cors(corsOptionsDelegate));

// Body parser middlewares with strict size limits to prevent Denial of Service (DoS) attacks
app.use(express.json({ limit: constants.BODY_LIMITS.JSON_MAX_SIZE }));
app.use(express.urlencoded({ extended: true, limit: constants.BODY_LIMITS.JSON_MAX_SIZE }));

const { maintenanceMiddleware } = require('./middleware/maintenance');

// Expose environment variables to static frontend client
app.get('/env-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.process = { env: { VITE_ADMIN_EMAIL: ${JSON.stringify(env.VITE_ADMIN_EMAIL)} } };`);
});

console.log('[Startup] Loading middleware...');
// Intercept traffic if Maintenance Mode is active (before static assets & consumer API routes)
app.use(maintenanceMiddleware);

// Serve client-side static files (HTML, CSS, JS) from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Page Routes (Direct browser address bar entry mapping)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dashboard.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/admin/dashboard.html'));
});

// API Routes
app.use('/api', resumeRoutes);
app.use('/api/admin', adminRoutes);



// Health check endpoint for testing server status
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy and running',
    timestamp: new Date().toISOString()
  });
});

// Dedicated 404 handler for API routes (unmatched API paths should not fall back to the SPA index.html)
app.use('/api/*', (req, res, next) => {
  const error = new Error(`API endpoint not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/signup.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dashboard.html'));
});

// Fallback route: Serve index.html for any frontend SPA routing (wildcard catch-all)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Centralized Error Handling Middleware (Extracted to dedicated middleware)
app.use(errorHandler);

module.exports = app;
