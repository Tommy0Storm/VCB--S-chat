// Progressive Search Hook
import { useState, useCallback, useRef } from 'react';
import { enhancedSearch, SearchOptions } from '../utils/enhancedSearch';
import { SearchResult } from '../utils/searchOptimizer';

interface UseProgressiveSearchReturn {
  results: SearchResult[];
  isSearching: boolean;
  isComplete: boolean;
  error: string | null;
  progress: number;
  search: (query: string, options?: SearchOptions) => Promise<void>;
  clearResults: () => void;
  cacheStats: ReturnType<typeof enhancedSearch.getCacheStats>;
}

export const useProgressiveSearch = (): UseProgressiveSearchReturn => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string, options: SearchOptions = {}) => {
    // Cancel previous search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    
    setIsSearching(true);
    setIsComplete(false);
    setError(null);
    setResults([]);
    setProgress(0);

    try {
      await enhancedSearch.search(
        query,
        { progressive: true, ...options },
        (progressResults: SearchResult[], complete: boolean) => {
          if (abortControllerRef.current?.signal.aborted) return;
          
          setResults(progressResults);
          setProgress(complete ? 100 : Math.min(90, progressResults.length * 30));
          
          if (complete) {
            setIsComplete(true);
            setIsSearching(false);
            setProgress(100);
          }
        }
      );
    } catch (err) {
      if (!abortControllerRef.current?.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setIsSearching(false);
        setIsComplete(true);
      }
    }
  }, []);

  const clearResults = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setResults([]);
    setIsSearching(false);
    setIsComplete(false);
    setError(null);
    setProgress(0);
  }, []);

  return {
    results,
    isSearching,
    isComplete,
    error,
    progress,
    search,
    clearResults,
    cacheStats: enhancedSearch.getCacheStats()
  };
};