/**
 * @file upload.js
 * @description Configures Multer middleware for handling resume file uploads.
 * Restricts allowed file types and sizes based on centralized constants.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const constants = require('../config/constants');
const logger = require('../utils/logger');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to avoid collision/overwrite
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, fileExtension)
      .replace(/[^a-zA-Z0-9]/g, '_'); // sanitize name
    
    cb(null, `${baseName}-${uniqueSuffix}${fileExtension}`);
  }
});

// File filter to restrict file extensions and validate MIME type
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;
  
  const isAllowedExt = constants.UPLOAD.ALLOWED_EXTENSIONS.includes(ext);
  const isAllowedMime = constants.UPLOAD.ALLOWED_MIME_TYPES.includes(mimeType);

  // Security validation: check both extension and MIME type
  if (isAllowedExt && isAllowedMime) {
    cb(null, true);
  } else {
    logger.warn('Upload', `Blocked upload of file with disallowed type: ${file.originalname} (ext: ${ext}, mime: ${mimeType})`);
    const error = new Error('Unsupported file type. Only PDF files (.pdf) are allowed.');
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error, false);
  }
};

// Configure dynamic wrapper for multer to support live fileSize clamp adjustments
const uploadWrapper = (fieldName) => {
  return (req, res, next) => {
    // Get max size from global.guardrails or fallback to constants
    const maxLimit = (global.guardrails && global.guardrails.maxFileSize) || constants.UPLOAD.MAX_FILE_SIZE;

    const dynamicMulter = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: { fileSize: maxLimit }
    });

    dynamicMulter.single(fieldName)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const limitMB = Math.round(maxLimit / (1024 * 1024));
          logger.warn('Upload', `Blocked upload: file size exceeded current live clamp of ${limitMB} MB.`);
          err.message = `File size limit exceeded. Max allowed is ${limitMB} MB.`;
          err.statusCode = 413; // Payload Too Large
        }
        return next(err);
      }
      next();
    });
  };
};

module.exports = {
  single: (fieldName) => uploadWrapper(fieldName)
};
