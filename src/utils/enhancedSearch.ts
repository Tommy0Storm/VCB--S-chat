// Enhanced Search with Performance Optimizations
import { searchOptimizer, SearchResult } from './searchOptimizer';
import { hybridSearch } from './enhancedWebSearch';

interface SearchOptions {
  progressive?: boolean;
  useCache?: boolean;
  maxResults?: number;
  timeout?: number;
}

interface SearchResponse {
  results: SearchResult[];
  fromCache: boolean;
  responseTime: number;
  totalFound: number;
}

class EnhancedSearchEngine {
  private readonly popularQueries = [
    'south african law',
    'labour law south africa',
    'constitutional court',
    'ccma procedures',
    'employment law'
  ];

  constructor() {
    // Preload popular queries on initialization
    this.preloadCache();
  }

  async search(
    query: string, 
    options: SearchOptions = {},
    onProgress?: (results: SearchResult[], isComplete: boolean) => void
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const { progressive = true, maxResults = 9 } = options;

    try {
      if (progressive && onProgress) {
        // Use progressive search with real-time updates
        const results = await searchOptimizer.progressiveSearch(
          query,
          async (q, limit) => {
            const searchResult = await hybridSearch(q, {
              useGoogle: true,
              useFreeAPIs: true,
              maxResults: limit,
              fetchContent: false
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

  private convertToSearchResults(hybridResults: any[]): SearchResult[] {
    return hybridResults.map(result => ({
      title: result.title || '',
      snippet: result.snippet || result.description || '',
      link: result.link || result.url || '',
      source: result.source || 'unknown',
      timestamp: Date.now()
    }));
  }

  private async preloadCache(): Promise<void> {
    try {
      await searchOptimizer.preloadPopularQueries(
        this.popularQueries,
        async (query, limit) => {
          const searchResult = await hybridSearch(query, {
            useGoogle: true,
            useFreeAPIs: true,
            maxResults: limit,
            fetchContent: false
          });
          return this.convertToSearchResults(searchResult.results);
        }
      );
    } catch (error) {
      console.warn('Failed to preload cache:', error);
    }
  }

  getCacheStats() {
    return searchOptimizer.getCacheStats();
  }

  clearCache(): void {
    searchOptimizer.clearCache();
  }
}

export const enhancedSearch = new EnhancedSearchEngine();
export type { SearchOptions, SearchResponse };