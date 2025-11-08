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
  private readonly CACHE_TTL = 60 * 60 * 1000; // 60 minutes for maximum retention
  private readonly MAX_CACHE_SIZE = 200; // Increased cache size
  private readonly BATCH_SIZE = 4; // Larger batches for comprehensive results

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
      // Load results in MAXIMUM progressive batches
      while (batch <= 4) { // Increased from 3 to 4 batches
        const batchResults = await searchFn(query, this.BATCH_SIZE);
        
        if (batchResults.length === 0) break;

        // Advanced rank and score results with enhanced algorithms
        const rankedResults = this.rankResults(batchResults, query);
        allResults.push(...rankedResults);

        // Progressive callback with comprehensive data
        onProgress([...allResults], batch >= 4);
        
        batch++;
        
        // Optimized delay for maximum throughput
        if (batch <= 4) await new Promise(resolve => setTimeout(resolve, 150));
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

      // MAXIMUM RANKING ALGORITHM - Multi-factor scoring
      
      // Title relevance (highest weight)
      queryTerms.forEach(term => {
        if (title.includes(term)) score += 15; // Increased weight
        if (title.startsWith(term)) score += 8;
        if (title.toLowerCase() === term.toLowerCase()) score += 20; // Exact match bonus
      });

      // Advanced snippet relevance with position weighting
      queryTerms.forEach(term => {
        const snippetMatches = (snippet.match(new RegExp(term, 'gi')) || []).length;
        score += snippetMatches * 3; // Increased weight
        
        // Early position bonus (terms appearing early in snippet)
        const firstIndex = snippet.toLowerCase().indexOf(term.toLowerCase());
        if (firstIndex >= 0 && firstIndex < 50) score += 5;
      });

      // Enhanced source quality with domain authority
      const sourceBonus = {
        'google': 5,     // Increased
        'wikipedia': 4,  // Increased
        'duckduckgo': 2, // Increased
        'bing': 3,
        'academic': 6    // Highest for academic sources
      };
      score += sourceBonus[result.source as keyof typeof sourceBonus] || 1;

      // Advanced recency scoring
      if (result.timestamp) {
        const age = Date.now() - result.timestamp;
        const daysSincePublished = age / (1000 * 60 * 60 * 24);
        if (daysSincePublished < 7) score += 5;   // Very recent
        else if (daysSincePublished < 30) score += 3; // Recent
        else if (daysSincePublished < 90) score += 1; // Somewhat recent
      }
      
      // Query complexity bonus - longer queries get more sophisticated ranking
      if (queryTerms.length > 3) score += 2;
      if (queryTerms.length > 6) score += 3;

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

  // MAXIMUM preload popular queries with enhanced coverage
  async preloadPopularQueries(queries: string[], searchFn: (query: string, limit: number) => Promise<SearchResult[]>): Promise<void> {
    const preloadPromises = queries.map(async (query, index) => {
      if (!this.getFromCache(query)) {
        try {
          // Stagger requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, index * 200));
          
          const results = await searchFn(query, this.BATCH_SIZE * 2); // Double batch size for preload
          const rankedResults = this.rankResults(results, query);
          this.addToCache(query, rankedResults);
          
          console.log(`[Preload] Cached ${rankedResults.length} results for: ${query}`);
        } catch (error) {
          console.warn(`Failed to preload query: ${query}`, error);
        }
      }
    });
    
    // Execute all preloads concurrently with proper error handling
    await Promise.allSettled(preloadPromises);
  }
}

export const searchOptimizer = new SearchOptimizer();
export type { SearchResult };