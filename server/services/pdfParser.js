/**
 * @file pdfParser.js
 * @description Service layer for parsing and extracting text from PDF files.
 * Uses pdf-parse to load buffer content asynchronously and extract text.
 */

const fs = require('fs').promises;
const { PDFParse } = require('pdf-parse');
const logger = require('../utils/logger');

/**
 * Extracts raw text from a PDF file asynchronously.
 * @param {string} filePath - Absolute path to the PDF file on disk.
 * @returns {Promise<string>} - Extracted text content from the PDF.
 * @throws {Error} - Rejects with a descriptive error if parsing fails.
 */
const extractText = async (filePath) => {
  let parser = null;
  try {
    // Read file from disk asynchronously into a buffer
    const fileBuffer = await fs.readFile(filePath);
    
    // Instantiate the PDFParse class with the file buffer data
    parser = new PDFParse({ data: fileBuffer });
    
    // Extract text from the PDF
    const result = await parser.getText();
    
    // Return extracted text content
    return result.text || '';
  } catch (error) {
    logger.error('PDFParser', `PDF Parsing Failure: ${error.message}`, { filePath });
    throw new Error(`PDF Parsing Failure: ${error.message}`);
  } finally {
    // Clean up parser references to free up memory
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch (destroyError) {
        logger.error('PDFParser', 'Failed to destroy PDF parser instance:', destroyError);
      }
    }
    // Clean up uploaded file from local server disk
    try {
      await fs.unlink(filePath);
    } catch (unlinkErr) {
      logger.warn('PDFParser', `[pdfParser] Failed to delete temp file: ${filePath} ${unlinkErr.message}`);
    }
  }
};

module.exports = {
  extractText
};
