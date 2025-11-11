import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import type { StoredDocument } from '../types/documents';

/**
 * EmbeddingEngine class for generating document embeddings using @xenova/transformers
 * Uses MiniLM-L6-v2 model for client-side text embedding
 */
export class EmbeddingEngine {
  private embedder: FeatureExtractionPipeline | null = null;
  private _isInitialized: boolean = false;

  /**
   * Initialize the embedding model
   * @returns Promise resolving when model is loaded
   */
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      // Load the transformer pipeline
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      this._isInitialized = true;
      console.log('EmbeddingEngine: Model loaded successfully');
    } catch (error) {
      console.error('EmbeddingEngine: Failed to load model:', error);
      throw new Error('Failed to initialize embedding model. Please check your network connection and try again.');
    }
  }

  /**
   * Generate embeddings for a single text string
   * @param text - Text to generate embedding for
   * @returns Promise resolving to embedding array
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!this._isInitialized) {
      await this.initialize();
    }

    if (!this.embedder) {
      throw new Error('Embedding model not initialized');
    }

    try {
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      // Convert tensor to array
      return Array.from(output.data);
    } catch (error) {
      console.error('EmbeddingEngine: Failed to generate embedding:', error);
      throw new Error('Failed to generate embedding. Please try again.');
    }
  }

  /**
   * Generate embeddings for all chunks in a document
   * @param document - Document to generate embeddings for
   * @returns Promise resolving to array of embeddings
   */
  public async generateDocumentEmbeddings(document: StoredDocument): Promise<number[][]> {
    if (!this._isInitialized) {
      await this.initialize();
    }

    // Get text chunks from document
    const chunks = document.text ? this.chunkText(document.text) : [];
    
    // Generate embeddings for each chunk
    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk);
      embeddings.push(embedding);
    }
    
    return embeddings;
  }

  /**
   * Chunk text into smaller pieces for embedding
   * @param text - Text to chunk
   * @returns Array of text chunks
   */
  private chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Split into sentences first to preserve semantic boundaries
    const sentences = this.splitIntoSentences(text);
    
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      // If adding this sentence would exceed chunk size and we already have content,
      // finalize the current chunk and start a new one
      if (currentChunk.length > 0 &&
          currentChunk.length + sentence.length > 800) {
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
  }

  /**
   * Split text into sentences using punctuation as delimiters
   * @param text - The text to split
   * @returns Array of sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation while keeping the punctuation
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
  }
  
  /**
   * Check if the embedding engine is initialized
   * @returns boolean indicating if the engine is initialized
   */
  public get isInitialized(): boolean {
    return this._isInitialized;
  }
}