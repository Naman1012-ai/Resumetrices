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
    logger.warn('Upload', `Blocked upload of file with disallowed type: ${originalname} (ext: ${ext}, mime: ${mimeType})`);
    const error = new Error('Unsupported file type. Only PDF files (.pdf) are allowed.');
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error, false);
  }
};

// Configure limits from constants (5MB file size limit)
const limits = {
  fileSize: constants.UPLOAD.MAX_FILE_SIZE
};

// Create the multer upload middleware instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits
});

module.exports = upload;
