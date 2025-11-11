import { searchCache } from './searchCache';

export interface NewsArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsApiResponse {
  status: 'ok' | 'error';
  totalResults: number;
  articles: NewsArticle[];
}

// NewsAPI configuration
const NEWSAPI_KEY = import.meta.env.VITE_NEWSAPI_KEY;
const BASE_URL = 'https://newsapi.org/v2';

// Validate that the API key is configured
if (!NEWSAPI_KEY) {
  console.warn('VITE_NEWSAPI_KEY not configured. NewsAPI functionality will be disabled.');
}

// Helper to sanitize query for API
const sanitizeNewsQuery = (query: string): string => {
  return query
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, 200);
};

// Helper to get country code from location
const getCountryCode = (location: string): string => {
  // Default to South Africa
  if (!location) return 'za';
  
  // Map common South African locations to country codes
  const locationToCountry: Record<string, string> = {
    'johannesburg': 'za',
    'pretoria': 'za',
    'cape town': 'za',
    'durban': 'za',
    'port elizabeth': 'za',
    'east london': 'za',
    'bloemfontein': 'za',
    'south africa': 'za',
    'sa': 'za',
    'za': 'za'
  };
  
  const lowerLocation = location.toLowerCase();
  for (const [key, code] of Object.entries(locationToCountry)) {
    if (lowerLocation.includes(key)) {
      return code;
    }
  }
  
  return 'za'; // Default to South Africa
};

// Helper to get category from query
const getCategoryFromQuery = (query: string): string | null => {
  const categories: Record<string, string> = {
    'business': 'business',
    'finance': 'business',
    'economy': 'business',
    'technology': 'technology',
    'tech': 'technology',
    'science': 'science',
    'health': 'health',
    'medical': 'health',
    'sports': 'sports',
    'football': 'sports',
    'rugby': 'sports',
    'cricket': 'sports',
    'entertainment': 'entertainment',
    'music': 'entertainment',
    'movies': 'entertainment',
    'film': 'entertainment',
    'politics': 'politics',
    'government': 'politics',
    'law': 'politics',
    'crime': 'crime',
    'war': 'war',
    'conflict': 'war',
    'environment': 'environment',
    'climate': 'environment',
    'weather': 'environment',
    'news': 'general',
    'headlines': 'general',
    'top': 'general'
  };
  
  const lowerQuery = query.toLowerCase();
  for (const [keyword, category] of Object.entries(categories)) {
    if (lowerQuery.includes(keyword)) {
      return category;
    }
  }
  
  return null; // Let NewsAPI decide
};

// Main function to fetch top headlines
export const newsApiTopHeadlines = async (
  query: string = '',
  options: {
    country?: string;
    category?: string;
    pageSize?: number;
    sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  } = {}
): Promise<NewsArticle[]> => {
  // Check cache first
  const cacheKey = `newsapi:${query}:${options.country || 'za'}:${options.category || 'general'}:${options.pageSize || 10}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    console.log('[NewsAPI] Using cached results');
    return cached.results as NewsArticle[];
  }

  // Validate API key
  if (!NEWSAPI_KEY) {
    console.error('NewsAPI key not configured. Cannot fetch headlines.');
    return [];
  }

  // Validate and sanitize inputs
  const sanitizedQuery = sanitizeNewsQuery(query);
  const country = options.country || getCountryCode(query);
  const category = options.category || getCategoryFromQuery(query) || 'general';
  const pageSize = options.pageSize || 10;
  const sortBy = options.sortBy || 'popularity';

  // Validate parameters
  if (pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize must be between 1 and 100');
  }

  try {
    // Construct URL for /top-headlines endpoint
    const url = new URL(`${BASE_URL}/top-headlines`);
    url.searchParams.set('apiKey', NEWSAPI_KEY);
    url.searchParams.set('country', country);
    url.searchParams.set('category', category);
    url.searchParams.set('pageSize', pageSize.toString());
    url.searchParams.set('sortBy', sortBy);

    // If query is provided, use /everything endpoint instead
    if (sanitizedQuery) {
      url.pathname = `${BASE_URL}/everything`;
      url.searchParams.set('q', sanitizedQuery);
      url.searchParams.delete('country'); // Remove country for everything endpoint
      url.searchParams.delete('category'); // Remove category for everything endpoint
    }

    console.log(`[NewsAPI] Fetching ${sanitizedQuery ? 'articles' : 'top headlines'} with parameters:`, {
      country,
      category,
      pageSize,
      sortBy,
      query: sanitizedQuery
    });

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'GOGGA-AI/1.0'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`NewsAPI error: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const data: NewsApiResponse = await response.json();

    if (data.status !== 'ok') {
      throw new Error(`NewsAPI returned status: ${data.status}`);
    }

    // Cache results for 30 minutes
    searchCache.set(cacheKey, data.articles, 'newsapi');

    return data.articles;
  } catch (error) {
    console.error('NewsAPI fetch failed:', error);
    // Return empty array on error - don't throw to avoid breaking UI
    return [];
  }
};

// Helper function to get top headlines for current location
export const newsApiLocalHeadlines = async (
  location: string = '',
  options: {
    pageSize?: number;
    sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  } = {}
): Promise<NewsArticle[]> => {
  return newsApiTopHeadlines('', {
    country: getCountryCode(location),
    pageSize: options.pageSize,
    sortBy: options.sortBy
  });
};

// Helper function to search for articles by keyword
export const newsApiSearch = async (
  query: string,
  options: {
    country?: string;
    category?: string;
    pageSize?: number;
    sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
    from?: string; // ISO date string
    to?: string; // ISO date string
  } = {}
): Promise<NewsArticle[]> => {
  // Validate query
  if (!query || query.trim().length === 0) {
    throw new Error('Search query is required');
  }

  // Use the main newsApiTopHeadlines function with query parameter
  return newsApiTopHeadlines(query, {
    country: options.country,
    category: options.category,
    pageSize: options.pageSize,
    sortBy: options.sortBy
  });
};