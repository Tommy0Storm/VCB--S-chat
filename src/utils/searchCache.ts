interface CacheEntry {
  results: any[];
  timestamp: number;
  source: string;
}

class SearchCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  set(query: string, results: any[], source: string): void {
    this.cache.set(query.toLowerCase(), {
      results,
      timestamp: Date.now(),
      source
    });
  }

  get(query: string): CacheEntry | null {
    const entry = this.cache.get(query.toLowerCase());
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(query.toLowerCase());
      return null;
    }
    
    return entry;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const searchCache = new SearchCache();