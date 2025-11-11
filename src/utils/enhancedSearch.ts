// Enhanced Search with Performance Optimizations
import { searchOptimizer, SearchResult } from './searchOptimizer';
import { hybridSearch } from './enhancedWebSearch';
import { EmbeddingEngine } from './embeddingEngine';
import { ConversationManager } from './conversationManager';
import type { StoredDocument } from '../types/documents';
import { chunkDocumentText } from './documentProcessor';
import { documentStore } from './documentStoreDexie';

interface SearchOptions {
  progressive?: boolean;
  useCache?: boolean;
  maxResults?: number;
}

interface SearchResponse {
  results: SearchResult[];
  fromCache: boolean;
  responseTime: number;
  totalFound: number;
}

class EnhancedSearchEngine {
  private embeddingEngine: EmbeddingEngine;
  private conversationManager: ConversationManager;
  // popularQueries removed as per request - no preloading of caching or searching
  
  private isInitialized = false;

  constructor() {
    this.embeddingEngine = new EmbeddingEngine();
    this.conversationManager = new ConversationManager();
  }

  /**
   * Initialize the search engine with optional cache preloading
   * This should be called after the app is ready to avoid blocking initial load
   * @param preloadCache Whether to preload the cache with popular queries (default: false)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[EnhancedSearchEngine] Already initialized');
      return;
    }
    
    try {
      console.log('[EnhancedSearchEngine] Initializing...');
      
      // POPIA COMPLIANCE: NO PRELOADING OR CACHING UNTIL USER REQUESTS SEARCH
      // Disable cache preloading by default for privacy compliance - ALWAYS disabled
      console.log('[EnhancedSearchEngine] Cache preloading disabled for POPIA compliance (forced)');
      
      this.isInitialized = true;
      console.log('[EnhancedSearchEngine] Initialization completed successfully');
    } catch (error) {
      console.error('[EnhancedSearchEngine] Initialization failed:', error);
      // Don't throw the error to prevent blocking the application
      // The search engine can still function without preloaded cache
    }
  }

  async search(
    query: string, 
    options: SearchOptions = {},
    onProgress?: (results: SearchResult[], isComplete: boolean) => void
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const { progressive = true, maxResults = 9 } = options;

    try {
      // First, try to find relevant documents using local embeddings
      const documentResults = await this.searchLocalDocuments(query, maxResults);
      
      // If we found relevant local documents, return them as search results
      if (documentResults.length > 0) {
        console.log('[EnhancedSearch] Found', documentResults.length, 'relevant local document results');
        
        return {
          results: documentResults,
          fromCache: false,
          responseTime: Date.now() - startTime,
          totalFound: documentResults.length
        };
      }
      
      // If no relevant local documents found, fall back to web search
      if (progressive && onProgress) {
        // Use progressive search with real-time updates
        const results = await searchOptimizer.progressiveSearch(
          query,
          async (q, limit) => {
            const searchResult = await hybridSearch(q, {
              useGoogle: true,
              useFreeAPIs: true,
              maxResults: limit * 2, // Double results for better ranking
              fetchContent: true     // Enable content fetching
            });
            return this.convertToSearchResults(searchResult.results);
          },
          onProgress
        );

        return {
          results: results.slice(0, maxResults),
          fromCache: false,
          responseTime: Date.now() - startTime,
          totalFound: results.length
        };
      } else {
        // Standard search
        const searchResult = await hybridSearch(query, {
          useGoogle: true,
          useFreeAPIs: true,
          maxResults,
          fetchContent: false
        });

        const results = this.convertToSearchResults(searchResult.results);
        
        return {
          results,
          fromCache: false,
          responseTime: Date.now() - startTime,
          totalFound: results.length
        };
      }
    } catch (error) {
      console.error('Enhanced search failed:', error);
      return {
        results: [],
        fromCache: false,
        responseTime: Date.now() - startTime,
        totalFound: 0
      };
    }
  }

  private convertToSearchResults(hybridResults: {title: string; snippet: string; link: string; source?: string}[]): SearchResult[] {
    return hybridResults.map(result => ({
      title: result.title || '',
      snippet: result.snippet || '',
      link: result.link || '',
      source: result.source ? (typeof result.source === 'string' ? result.source : 'unknown') : 'unknown',
      timestamp: Date.now()
    }));
  }
  
  /**
   * Search for relevant documents using local embeddings
   * @param query - The search query
   * @param maxResults - Maximum number of results to return
   * @returns Array of search results from local documents
   */
  private async searchLocalDocuments(query: string, maxResults: number): Promise<SearchResult[]> {
    try {
      // Initialize embedding engine if needed
      if (!this.embeddingEngine.isInitialized) {
        await this.embeddingEngine.initialize();
      }
      
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingEngine.generateEmbedding(query);
      
      // Get all documents from all conversations and from IndexedDB
      const allDocuments: StoredDocument[] = [];
      const conversations = this.conversationManager.getAllConversations();
      
      conversations.forEach(conv => {
        conv.documents.forEach(doc => {
          if (doc.text && doc.embeddings && doc.embeddings.length > 0) {
            allDocuments.push(doc);
          }
        });
      });
      
      // Also get documents from IndexedDB
      const indexedDBDocuments = await documentStore.loadDocuments();
      indexedDBDocuments.forEach(doc => {
        if (doc.text && doc.embeddings && doc.embeddings.length > 0) {
          allDocuments.push(doc);
        }
      });
      
      // If no documents with embeddings, return empty results
      if (allDocuments.length === 0) {
        return [];
      }
      
      // Calculate cosine similarity between query embedding and document embeddings
      const similarities: { document: StoredDocument; similarity: number; chunkIndex: number; chunkText: string }[] = [];
      
      for (const doc of allDocuments) {
        // Each document has multiple embeddings (one per chunk)
        if (!doc.embeddings || doc.embeddings.length === 0) continue;
        
        for (let i = 0; i < doc.embeddings.length; i++) {
          const docEmbedding = doc.embeddings[i];
          
          // Calculate cosine similarity
          const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
          
          // Get the corresponding text chunk
          const chunks = chunkDocumentText(doc.text, 800);
          const chunkText = chunks[i] || '';
          
          similarities.push({
            document: doc,
            similarity,
            chunkIndex: i,
            chunkText
          });
        }
      }
      
      // Sort by similarity (highest first)
      similarities.sort((a, b) => b.similarity - a.similarity);
      
      // Return top results as search results
      return similarities
        .slice(0, maxResults)
        .map(item => ({
          title: `${item.document.name} (Document ${item.chunkIndex + 1})`,
          snippet: item.chunkText.length > 200 ? item.chunkText.substring(0, 200) + '...' : item.chunkText,
          link: `document:${item.document.id}`,
          source: 'local-document',
          score: item.similarity
        }));
    } catch (error) {
      console.error('Failed to search local documents:', error);
      return [];
    }
  }
  
  /**
   * Calculate cosine similarity between two vectors
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity (0 to 1)
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    // Ensure vectors are the same length
    const len = Math.min(a.length, b.length);
    
    // Calculate dot product
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    // Calculate magnitudes
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    // Avoid division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    // Return cosine similarity
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // preloadCache method removed as per request - no preloading of caching or searching

  getCacheStats() {
    return searchOptimizer.getCacheStats();
  }

  clearCache(): void {
    searchOptimizer.clearCache();
  }
  
  /**
   * Check if the search engine is initialized
   */
  isSearchEngineInitialized(): boolean {
    return this.isInitialized;
  }
}

export const enhancedSearch = new EnhancedSearchEngine();
export type { SearchOptions, SearchResponse };