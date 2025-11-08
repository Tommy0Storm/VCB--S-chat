export interface SearchConfig {
  maxResults: number;
  fetchContent: boolean;
  useAIAnalysis: boolean;
  useFreeAPIs: boolean;
  contentLimit: number;
  timeoutMs: number;
  enableCaching: boolean;
}

export const SEARCH_STRATEGIES = {
  // Cost-effective: Free APIs + AI analysis
  BUDGET: {
    maxResults: 3,
    fetchContent: true,
    useAIAnalysis: true,
    useFreeAPIs: true,
    contentLimit: 1500,
    timeoutMs: 5000,
    enableCaching: true
  } as SearchConfig,
  
  // Balanced: Google + Free APIs + AI analysis
  STANDARD: {
    maxResults: 5,
    fetchContent: true,
    useAIAnalysis: true,
    useFreeAPIs: true,
    contentLimit: 3000,
    timeoutMs: 8000,
    enableCaching: true
  } as SearchConfig,
  
  // Premium: Full Google + AI + extensive content
  PREMIUM: {
    maxResults: 8,
    fetchContent: true,
    useAIAnalysis: true,
    useFreeAPIs: false,
    contentLimit: 5000,
    timeoutMs: 12000,
    enableCaching: true
  } as SearchConfig,
  
  // SerpAPI: Real-time Google results with rich data
  SERPAPI: {
    maxResults: 10,
    fetchContent: false,
    useAIAnalysis: true,
    useFreeAPIs: false,
    contentLimit: 0,
    timeoutMs: 8000,
    enableCaching: true
  } as SearchConfig,
  
  // Quick: Snippets + AI analysis
  QUICK: {
    maxResults: 5,
    fetchContent: false,
    useAIAnalysis: true,
    useFreeAPIs: true,
    contentLimit: 500,
    timeoutMs: 3000,
    enableCaching: true
  } as SearchConfig
};

// Cost tracking for different search methods
export const SEARCH_COSTS = {
  GOOGLE_SEARCH_PER_QUERY: 0.005, // $0.005 per query (100 queries = $0.50)
  SERPAPI_PER_QUERY: 0.10, // $0.10 per SerpAPI query
  CONTENT_FETCH_PER_PAGE: 0.001, // Proxy service cost
  AI_ANALYSIS_PER_REQUEST: 0.01, // Cerebras API cost
  FREE_API_CALLS: 0, // DuckDuckGo, Wikipedia are free
};

export const calculateSearchCost = (strategy: SearchConfig, numQueries: number = 1, isSerpApi: boolean = false): number => {
  let cost = 0;
  
  // SerpAPI cost (premium)
  if (isSerpApi) {
    cost += SEARCH_COSTS.SERPAPI_PER_QUERY * numQueries;
  } else if (!strategy.useFreeAPIs) {
    // Google Search API cost
    cost += SEARCH_COSTS.GOOGLE_SEARCH_PER_QUERY * numQueries;
  }
  
  // Content fetching cost
  if (strategy.fetchContent) {
    cost += SEARCH_COSTS.CONTENT_FETCH_PER_PAGE * strategy.maxResults * numQueries;
  }
  
  // AI analysis cost
  if (strategy.useAIAnalysis) {
    cost += SEARCH_COSTS.AI_ANALYSIS_PER_REQUEST * numQueries;
  }
  
  return cost;
};

// Auto-select strategy based on query complexity and user tier
export const selectSearchStrategy = (query: string, userTier: 'free' | 'starter' | 'standard' | 'pro' = 'free'): SearchConfig => {
  const queryLength = query.split(' ').length;
  const isComplex = /\b(analyze|compare|research|detailed|comprehensive)\b/i.test(query);
  const needsRecent = /\b(latest|recent|current|today|news)\b/i.test(query);
  
  // Free tier: Always use budget strategy
  if (userTier === 'free') {
    return SEARCH_STRATEGIES.BUDGET;
  }
  
  // Starter tier: Budget for simple, standard for complex
  if (userTier === 'starter') {
    return (isComplex || queryLength > 10) ? SEARCH_STRATEGIES.STANDARD : SEARCH_STRATEGIES.BUDGET;
  }
  
  // Standard tier: Standard for most, premium for very complex
  if (userTier === 'standard') {
    if (isComplex && queryLength > 15) return SEARCH_STRATEGIES.PREMIUM;
    if (needsRecent || queryLength > 8) return SEARCH_STRATEGIES.STANDARD;
    return SEARCH_STRATEGIES.BUDGET;
  }
  
  // Pro tier: Premium for complex, standard for others
  if (userTier === 'pro') {
    if (isComplex || needsRecent || queryLength > 12) return SEARCH_STRATEGIES.PREMIUM;
    return SEARCH_STRATEGIES.STANDARD;
  }
  
  return SEARCH_STRATEGIES.BUDGET;
};

// Cache management for search results
class SearchCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  set(key: string, data: any, ttlMinutes: number = 30): void {
    try {
      if (!key || !data) return;
      
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl: Math.max(ttlMinutes, 1) * 60 * 1000
      });
      
      // Cleanup old entries if cache gets too large
      if (this.cache.size > 100) {
        this.cleanup();
      }
    } catch (error) {
      console.error('[Cache] Set failed:', error);
    }
  }
  
  get(key: string): any | null {
    try {
      if (!key) return null;
      
      const entry = this.cache.get(key);
      if (!entry) return null;
      
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        return null;
      }
      
      return entry.data;
    } catch (error) {
      console.error('[Cache] Get failed:', error);
      return null;
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

export const searchCache = new SearchCache();

// Generate cache key for search queries
export const generateCacheKey = (query: string, config: SearchConfig): string => {
  return `search_${btoa(query)}_${config.maxResults}_${config.fetchContent}_${config.useAIAnalysis}`;
};