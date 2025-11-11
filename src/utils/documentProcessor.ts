import type { StoredDocument } from '../types/documents';

/**
 * Splits text into chunks while preserving semantic boundaries
 * @param text - The text to chunk
 * @param chunkSize - Target size for each chunk (in characters)
 * @returns Array of text chunks
 */
export const chunkDocumentText = (text: string, chunkSize: number = 800): string[] => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split into sentences first to preserve semantic boundaries
  const sentences = splitIntoSentences(text);
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed chunk size and we already have content,
    // finalize the current chunk and start a new one
    if (currentChunk.length > 0 && 
        currentChunk.length + sentence.length > chunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      // Add sentence to current chunk
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
  }
  
  // Add the last chunk if it exists
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
};

/**
 * Splits text into sentences using punctuation as delimiters
 * @param text - The text to split
 * @returns Array of sentences
 */
export const splitIntoSentences = (text: string): string[] => {
  // Split on sentence-ending punctuation while keeping the punctuation
  // This handles . ! ? and also handles common abbreviations
  const sentenceEndings = /(?<=[.!?])\s+(?=[A-Z])/g;
  
  // Split the text into potential sentences
  const potentialSentences = text.split(sentenceEndings);
  
  const sentences: string[] = [];
  
  for (const sentence of potentialSentences) {
    // Clean up whitespace and handle edge cases
    const cleaned = sentence.trim();
    if (cleaned.length > 0) {
      sentences.push(cleaned);
    }
  }
  
  return sentences;
};

/**
 * Extracts text from a document and chunks it into smaller pieces
 * @param document - The document to process
 * @returns Array of text chunks
 */
export const extractAndChunkDocument = (document: StoredDocument): string[] => {
  // Extract text from document (assuming it's already extracted in StoredDocument)
  const text = document.text || '';
  
  // Chunk the text into smaller pieces
  return chunkDocumentText(text, 800);
};

/**
 * Extracts text content from various document formats
 * @param file - File object to extract text from
 * @returns Promise resolving to extracted text
 */
export const extractTextFromFile = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  
  try {
    // Handle text-based formats directly
    if (['txt', 'md'].includes(extension)) {
      return await file.text();
    }
    
    // Handle PDF files
    if (extension === 'pdf') {
      // PDF processing is currently disabled due to build issues
      throw new Error('PDF processing is currently disabled. Please use a text-based format like .txt or .md');
    }
    
    // Handle DOCX files
    if (extension === 'docx') {
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    
    // Handle DOC files (fallback to text extraction)
    if (extension === 'doc') {
      return await file.text();
    }
    
    // Default to text extraction for unknown formats
    return await file.text();
  } catch (error) {
    console.error(`Failed to extract text from ${extension} file:`, error);
    throw new Error(`Failed to process ${extension} file. Please try a different format.`);
  }
};
