import { hybridSearch, searchWithAIAnalysis, searchWithFreeAPIs } from './enhancedWebSearch';
import { searchWeb } from './webSearch';
import { searchWithSerpApi, searchWithSerpApiAndAI } from './serpApiSearch';
import { SEARCH_STRATEGIES, selectSearchStrategy, searchCache, generateCacheKey, calculateSearchCost } from './searchConfig';
// import { gogga, goggaSearch } from './goggaSearchOrchestrator';

interface SmartSearchResult {
  results: Array<{
    title: string;
    link: string;
    snippet: string;
    content?: string;
    summary?: string;
    relevanceScore?: number;
  }>;
  analysis: string;
  sources: string[];
  method: string;
  cost: number;
  cached: boolean;
  processingTime: number;
}

export class SmartSearchOrchestrator {
  private userTier: 'free' | 'starter' | 'standard' | 'pro' = 'free';
  private monthlySearchCount = 0;
  private monthlySearchBudget = 0;

  constructor(userTier: 'free' | 'starter' | 'standard' | 'pro' = 'free') {
    this.userTier = userTier;
    this.setMonthlyBudget();
  }

  private setMonthlyBudget(): void {
    const budgets = {
      free: 0,
      starter: 2.0,    // $2/month for search
      standard: 5.0,   // $5/month for search  
      pro: 15.0        // $15/month for search
    };
    this.monthlySearchBudget = budgets[this.userTier];
  }

  async search(
    query: string, 
    forceStrategy?: keyof typeof SEARCH_STRATEGIES,
    onProgress?: (message: string) => void
  ): Promise<SmartSearchResult> {
    const startTime = Date.now();
    
    // Select optimal strategy
    const strategy = forceStrategy 
      ? SEARCH_STRATEGIES[forceStrategy]
      : selectSearchStrategy(query, this.userTier);
    
    // Check cache first
    const cacheKey = generateCacheKey(query, strategy);
    if (strategy.enableCaching) {
      const cached = searchCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          cached: true,
          processingTime: Date.now() - startTime
        };
      }
    }

    // Calculate cost and check budget
    const estimatedCost = calculateSearchCost(strategy);
    if (this.monthlySearchCount * estimatedCost > this.monthlySearchBudget) {
      // Fallback to free strategy if over budget
      return this.performFreeSearch(query, startTime);
    }

    let result: SmartSearchResult;

    try {
      // Execute search based on strategy
      if (forceStrategy === 'SERPAPI') {
        result = await this.performSerpApiSearch(query, strategy, startTime, onProgress);
      } else if (strategy.useAIAnalysis) {
        result = await this.performAISearch(query, strategy, startTime);
      } else if (strategy.useFreeAPIs) {
        result = await this.performHybridSearch(query, strategy, startTime);
      } else {
        result = await this.performGoogleSearch(query, strategy, startTime);
      }

      // Cache successful results
      if (strategy.enableCaching && result.results.length > 0) {
        searchCache.set(cacheKey, { ...result, cached: false }, 30);
      }

      this.monthlySearchCount++;
      return result;

    } catch (error) {
      console.error('Smart search failed:', error);
      // Fallback to free search
      return this.performFreeSearch(query, startTime);
    }
  }

  private async performAISearch(query: string, strategy: any, startTime: number): Promise<SmartSearchResult> {
    const cerebrasApiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
    
    const searchResult = await searchWithAIAnalysis(query, cerebrasApiKey);
    
    return {
      results: searchResult.results,
      analysis: searchResult.analysis,
      sources: searchResult.sources,
      method: 'GOGGA AI-Enhanced Search',
      cost: calculateSearchCost(strategy),
      cached: false,
      processingTime: Date.now() - startTime
    };
  }

  private async performHybridSearch(query: string, strategy: any, startTime: number): Promise<SmartSearchResult> {
    const searchResult = await hybridSearch(query, {
      useGoogle: true,
      useFreeAPIs: true,
      fetchContent: strategy.fetchContent,
      maxResults: strategy.maxResults
    });

    return {
      results: searchResult.results,
      analysis: searchResult.analysis,
      sources: searchResult.sources,
      method: searchResult.method,
      cost: calculateSearchCost(strategy),
      cached: false,
      processingTime: Date.now() - startTime
    };
  }

  private async performGoogleSearch(query: string, strategy: any, startTime: number): Promise<SmartSearchResult> {
    const results = await searchWeb(query, strategy.fetchContent);
    
    const analysis = results.length > 0 
      ? `Found ${results.length} GOGGA search results for "${query}":\n\n${results.map((r, i) => 
          `${i + 1}. ${r.title}\n   ${r.snippet}\n`
        ).join('\n')}`
      : 'No GOGGA search results found.';

    const sources = results.map(r => `${r.title} - ${r.link}`);

    return {
      results,
      analysis,
      sources,
      method: 'GOGGA Search',
      cost: calculateSearchCost(strategy),
      cached: false,
      processingTime: Date.now() - startTime
    };
  }

  private async performSerpApiSearch(
    query: string, 
    strategy: any, 
    startTime: number,
    onProgress?: (message: string) => void
  ): Promise<SmartSearchResult> {
    const cerebrasApiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
    
    if (strategy.useAIAnalysis && cerebrasApiKey) {
      const serpResult = await searchWithSerpApiAndAI(query, cerebrasApiKey, onProgress, 'google');
      
      return {
        results: serpResult.searchResults,
        analysis: serpResult.aiAnalysis,
        sources: serpResult.sources,
        method: `GOGGA SerpAPI (${serpResult.engine.toUpperCase()}) + AI Analysis`,
        cost: 0.10,
        cached: false,
        processingTime: Date.now() - startTime
      };
    } else {
      onProgress?.('GOGGA is searching with SerpAPI...');
      const serpResult = await searchWithSerpApi(query, { maxResults: strategy.maxResults, engine: 'google' });
      
      const analysis = `GOGGA SerpAPI Results for "${query}":\n\n${serpResult.results.map((r, i) => 
        `${i + 1}. ${r.title}\n   ${r.snippet}\n`
      ).join('\n')}`;
      
      return {
        results: serpResult.results,
        analysis,
        sources: serpResult.results.map(r => `${r.title} - ${r.link}`),
        method: 'GOGGA SerpAPI (Real-time)',
        cost: 0.10,
        cached: false,
        processingTime: Date.now() - startTime
      };
    }
  }

  private async performFreeSearch(query: string, startTime: number): Promise<SmartSearchResult> {
    const searchResult = await searchWithFreeAPIs(query);
    
    return {
      results: searchResult.results,
      analysis: searchResult.summary,
      sources: searchResult.results.map(r => `${r.title} - ${r.link}`),
      method: 'GOGGA Free Search',
      cost: 0,
      cached: false,
      processingTime: Date.now() - startTime
    };
  }

  // Get search statistics
  getStats(): {
    monthlySearches: number;
    monthlyBudget: number;
    remainingBudget: number;
    cacheSize: number;
    userTier: string;
  } {
    const usedBudget = this.monthlySearchCount * calculateSearchCost(SEARCH_STRATEGIES.STANDARD);
    
    return {
      monthlySearches: this.monthlySearchCount,
      monthlyBudget: this.monthlySearchBudget,
      remainingBudget: Math.max(0, this.monthlySearchBudget - usedBudget),
      cacheSize: searchCache.size(),
      userTier: this.userTier
    };
  }

  // Reset monthly counters (call at start of each month)
  resetMonthlyStats(): void {
    this.monthlySearchCount = 0;
  }

  // Clear search cache
  clearCache(): void {
    searchCache.clear();
  }

  // Update user tier
  updateTier(newTier: 'free' | 'starter' | 'standard' | 'pro'): void {
    this.userTier = newTier;
    this.setMonthlyBudget();
  }
}

// Singleton instance for the app
export const smartSearch = new SmartSearchOrchestrator('free');

// Utility function for quick searches
export const quickSearch = async (query: string): Promise<SmartSearchResult> => {
  return smartSearch.search(query, 'QUICK');
};

// Utility function for comprehensive searches
export const comprehensiveSearch = async (query: string): Promise<SmartSearchResult> => {
  return smartSearch.search(query, 'PREMIUM');
};

// Utility function for real-time SerpAPI searches
export const serpApiSearch = async (
  query: string, 
  onProgress?: (message: string) => void
): Promise<SmartSearchResult> => {
  return smartSearch.search(query, 'SERPAPI', onProgress);
};

// GOGGA comprehensive search with multi-engine processing
export const goggaComprehensiveSearch = async (
  query: string,
  onProgress?: (message: string) => void
): Promise<SmartSearchResult> => {
  const startTime = Date.now();
  
  try {
    // const goggaResult = await goggaSearch(query, onProgress);
    throw new Error('GOGGA search not available');
    
    return {
      results: [],
      analysis: 'GOGGA search not available',
      sources: [],
      method: 'Fallback',
      cost: 0,
      cached: false,
      processingTime: Date.now() - startTime
    };
  } catch (error) {
    console.error('GOGGA search failed:', error);
    // Fallback to standard search
    return smartSearch.search(query, 'SERPAPI', onProgress);
  }
};

// Auto-detect search intent and use appropriate strategy
export const intelligentSearch = async (query: string): Promise<SmartSearchResult> => {
  // Analyze query to determine best approach
  const isFactual = /\b(what is|who is|when|where|how much)\b/i.test(query);
  const isRecent = /\b(latest|recent|current|today|news)\b/i.test(query);
  const isComplex = /\b(analyze|compare|research|detailed)\b/i.test(query);
  
  if (isComplex) {
    return smartSearch.search(query, 'PREMIUM');
  } else if (isRecent || query.split(' ').length > 8) {
    return smartSearch.search(query, 'STANDARD');
  } else if (isFactual) {
    return smartSearch.search(query, 'BUDGET');
  } else {
    return smartSearch.search(query, 'QUICK');
  }
};