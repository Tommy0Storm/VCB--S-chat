// Search Performance Optimizer
// Progressive loading, ranking algorithms, and intelligent caching

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
  source: string;
  score?: number;
  timestamp?: number;
}

interface CachedSearch {
  query: string;
  results: SearchResult[];
  timestamp: number;
  hitCount: number;
}

interface SearchMetrics {
  totalSearches: number;
  cacheHits: number;
  avgResponseTime: number;
}

class SearchOptimizer {
  private cache = new Map<string, CachedSearch>();
  private metrics: SearchMetrics = { totalSearches: 0, cacheHits: 0, avgResponseTime: 0 };
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CACHE_SIZE = 100;
  private readonly BATCH_SIZE = 3;

  // Progressive loading with batching
  async progressiveSearch(
    query: string,
    searchFn: (query: string, limit: number) => Promise<SearchResult[]>,
    onProgress: (results: SearchResult[], isComplete: boolean) => void
  ): Promise<SearchResult[]> {
    const startTime = Date.now();
    this.metrics.totalSearches++;

    // Check cache first
    const cached = this.getFromCache(query);
    if (cached) {
      this.metrics.cacheHits++;
      onProgress(cached.results, true);
      return cached.results;
    }

    const allResults: SearchResult[] = [];
    let batch = 1;

    try {
      // Load results in progressive batches
      while (batch <= 3) {
        const batchResults = await searchFn(query, this.BATCH_SIZE);
        
        if (batchResults.length === 0) break;

        // Rank and score results
        const rankedResults = this.rankResults(batchResults, query);
        allResults.push(...rankedResults);

        // Progressive callback
        onProgress([...allResults], batch >= 3);
        
        batch++;
        
        // Small delay between batches for better UX
        if (batch <= 3) await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Cache successful results
      if (allResults.length > 0) {
        this.addToCache(query, allResults);
      }

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime);

      return allResults;
    } catch (error) {
      console.error('Progressive search failed:', error);
      onProgress([], true);
      return [];
    }
  }

  // Advanced ranking algorithm
  private rankResults(results: SearchResult[], query: string): SearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return results.map(result => {
      let score = 0;
      const title = result.title.toLowerCase();
      const snippet = result.snippet.toLowerCase();

      // Title relevance (highest weight)
      queryTerms.forEach(term => {
        if (title.includes(term)) score += 10;
        if (title.startsWith(term)) score += 5;
      });

      // Snippet relevance
      queryTerms.forEach(term => {
        const snippetMatches = (snippet.match(new RegExp(term, 'g')) || []).length;
        score += snippetMatches * 2;
      });

      // Source quality bonus
      const sourceBonus = {
        'google': 3,
        'wikipedia': 2,
        'duckduckgo': 1
      };
      score += sourceBonus[result.source as keyof typeof sourceBonus] || 0;

      // Recency bonus (if timestamp available)
      if (result.timestamp) {
        const age = Date.now() - result.timestamp;
        const daysSincePublished = age / (1000 * 60 * 60 * 24);
        if (daysSincePublished < 30) score += 2;
      }

      return { ...result, score };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // Intelligent caching with LRU eviction
  private addToCache(query: string, results: SearchResult[]): void {
    const normalizedQuery = this.normalizeQuery(query);
    
    // Evict oldest if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(normalizedQuery, {
      query: normalizedQuery,
      results,
      timestamp: Date.now(),
      hitCount: 0
    });
  }

  private getFromCache(query: string): CachedSearch | null {
    const normalizedQuery = this.normalizeQuery(query);
    const cached = this.cache.get(normalizedQuery);

    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(normalizedQuery);
      return null;
    }

    // Update hit count and move to end (LRU)
    cached.hitCount++;
    this.cache.delete(normalizedQuery);
    this.cache.set(normalizedQuery, cached);

    return cached;
  }

  // Query normalization for better cache hits
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  private updateMetrics(responseTime: number): void {
    const { totalSearches, avgResponseTime } = this.metrics;
    this.metrics.avgResponseTime = 
      (avgResponseTime * (totalSearches - 1) + responseTime) / totalSearches;
  }

  // Cache management
  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      hitRate: this.metrics.totalSearches > 0 
        ? (this.metrics.cacheHits / this.metrics.totalSearches * 100).toFixed(1) + '%'
        : '0%',
      avgResponseTime: Math.round(this.metrics.avgResponseTime) + 'ms'
    };
  }

  // Preload popular queries
  async preloadPopularQueries(queries: string[], searchFn: (query: string, limit: number) => Promise<SearchResult[]>): Promise<void> {
    for (const query of queries) {
      if (!this.getFromCache(query)) {
        try {
          const results = await searchFn(query, this.BATCH_SIZE);
          this.addToCache(query, this.rankResults(results, query));
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        } catch (error) {
          console.warn(`Failed to preload query: ${query}`, error);
        }
      }
    }
  }
}

export const searchOptimizer = new SearchOptimizer();
export type { SearchResult };