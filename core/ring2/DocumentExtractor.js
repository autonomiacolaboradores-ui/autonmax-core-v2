'use strict';

// core/ring2/DocumentExtractor.js

class DocumentExtractor {
  static extractTextFromBuffer(fileName, fileBuffer, mimeType) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    
    if (ext === 'txt' || ext === 'csv' || ext === 'json' || ext === 'md' || mimeType.includes('text') || mimeType.includes('json')) {
      const rawText = fileBuffer.toString('utf-8');
      return {
        fileName,
        extractedText: rawText,
        charCount: rawText.length,
        format: ext.toUpperCase()
      };
    }

    if (ext === 'pdf') {
      // PDF text extraction buffer parser
      const rawString = fileBuffer.toString('binary');
      const textMatches = rawString.match(/\(([^()]+)\)\s*TJ/g) || rawString.match(/\(([^()]+)\)/g);
      let pdfText = '';

      if (textMatches) {
        pdfText = textMatches.map(m => m.replace(/[()]/g, '')).join(' ');
      } else {
        pdfText = rawString.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      }

      return {
        fileName,
        extractedText: pdfText.substring(0, 10000) || `[PDF Document ${fileName} uploaded - ${fileBuffer.length} bytes]`,
        charCount: pdfText.length,
        format: 'PDF'
      };
    }

    // Generic fallback for binary/other formats
    const fallbackText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      fileName,
      extractedText: fallbackText.substring(0, 8000) || `[Conteúdo extraído do arquivo ${fileName}]`,
      charCount: fallbackText.length,
      format: ext.toUpperCase() || 'BINARY'
    };
  }
}

module.exports = DocumentExtractor;
