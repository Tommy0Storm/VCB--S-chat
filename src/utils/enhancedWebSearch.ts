interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
  summary?: string;
  relevanceScore?: number;
  source?: 'google' | 'duckduckgo' | 'wikipedia' | 'cache';
}

import { searchCache } from './searchCache';

// Multiple free proxy services for content fetching
const PROXY_SERVICES = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
  'https://thingproxy.freeboard.io/fetch/'
];

const fetchPageContent = async (url: string): Promise<string> => {
  // Try multiple proxy services for better reliability
  for (const proxy of PROXY_SERVICES) {
    try {
      const proxyUrl = proxy.includes('allorigins') 
        ? `${proxy}${encodeURIComponent(url)}`
        : `${proxy}${url}`;
      
      const response = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) continue;
      
      const data = proxy.includes('allorigins') 
        ? await response.json().then(d => d.contents)
        : await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(data, 'text/html');
      
      // Enhanced content extraction
      ['script', 'style', 'nav', 'footer', 'header', 'aside', '.ad', '.advertisement'].forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.remove());
      });
      
      // Prioritize main content areas
      const contentSelectors = ['main', 'article', '.content', '.post', '.entry', 'body'];
      let textContent = '';
      
      for (const selector of contentSelectors) {
        const element = doc.querySelector(selector);
        if (element?.textContent) {
          textContent = element.textContent;
          break;
        }
      }
      
      if (!textContent) {
        textContent = doc.body?.textContent || '';
      }
      
      // Clean and limit content
      const cleaned = textContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 3000); // Increased to 3000 chars for better context
      
      return cleaned;
    } catch (error) {
      console.warn(`Proxy ${proxy} failed:`, error);
      continue;
    }
  }
  return '';
};

const detectLegalQuery = (query: string): boolean => {
  const legalKeywords = [
    'case law', 'court', 'judgment', 'precedent', 'statute', 'act', 'section',
    'constitutional', 'supreme court', 'high court', 'magistrate', 'ccma',
    'labour court', 'tribunal', 'legal', 'law', 'litigation', 'appeal',
    'criminal', 'civil', 'contract', 'delict', 'tort', 'damages'
  ];
  
  return legalKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  );
};

const isResultQualityGood = (results: any[], query: string): boolean => {
  if (results.length === 0) return false;
  
  const queryTerms = query.toLowerCase().split(/\s+/);
  let relevantResults = 0;
  
  results.forEach((result: any) => {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    const matches = queryTerms.filter(term => text.includes(term)).length;
    
    // Consider result relevant if it matches at least 50% of query terms
    if (matches >= queryTerms.length * 0.5) {
      relevantResults++;
    }
  });
  
  // Quality is good if at least 60% of results are relevant
  return relevantResults >= results.length * 0.6;
};

const generateAlternativeQuery = (query: string, isLegal: boolean): string => {
  const synonyms = {
    'case law': 'precedent OR judgment OR ruling',
    'court': 'tribunal OR magistrate OR judge',
    'contract': 'agreement OR deal OR arrangement',
    'damages': 'compensation OR loss OR harm',
    'employment': 'labour OR work OR job',
    'dismissal': 'termination OR firing OR discharge',
    'unfair': 'unjust OR wrongful OR improper'
  };
  
  let altQuery = query;
  
  // Replace key terms with synonyms
  Object.entries(synonyms).forEach(([term, replacement]) => {
    if (query.toLowerCase().includes(term)) {
      altQuery = altQuery.replace(new RegExp(term, 'gi'), replacement);
    }
  });
  
  // Add context words for legal queries
  if (isLegal && !altQuery.includes('South Africa')) {
    altQuery += ' South African law';
  }
  
  return altQuery !== query ? altQuery : `${query} OR related OR similar`;
};

// Enhanced search with content analysis and AI summarization
export const enhancedSearchWeb = async (query: string, fetchContent = false, maxResults = 5): Promise<SearchResult[]> => {
  // Check cache first
  const cached = searchCache.get(query);
  if (cached) {
    console.log('[GOGGA Cache] Using cached results');
    return cached.results.map(r => ({ ...r, source: 'cache' as const }));
  }
  const apiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY;
  const isLegal = detectLegalQuery(query);
  const engineId = isLegal 
    ? import.meta.env.VITE_LEGAL_SEARCH_ENGINE_ID
    : import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID;
  
  if (!apiKey || !engineId) {
    throw new Error('Google Search API not configured');
  }

  try {
    // Enhanced search with additional parameters
    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('cx', engineId);
    
    // Add South African context to legal queries
    const searchQuery = isLegal ? `${query} site:saflii.org OR site:justice.gov.za OR "South Africa"` : query;
    searchUrl.searchParams.set('q', searchQuery);
    
    searchUrl.searchParams.set('num', Math.min(maxResults, 10).toString());
    searchUrl.searchParams.set('dateRestrict', 'y1'); // Last year for fresher content
    searchUrl.searchParams.set('safe', 'medium');
    searchUrl.searchParams.set('lr', 'lang_en'); // English results
    
    if (isLegal) {
      searchUrl.searchParams.set('gl', 'za'); // South Africa geo-location
    }
    
    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    console.log(`[GOGGA Enhanced Search] Using ${isLegal ? 'Legal (SA)' : 'General'} search engine`);
    console.log(`[GOGGA Enhanced Search] Engine ID: ${engineId?.slice(0, 8)}...`);
    console.log(`[GOGGA Enhanced Search] Query length: ${searchQuery.length} chars`);
    
    const data = await response.json();
    let results = (data.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      source: 'google' as const
    }));
    
    // Second search if results are insufficient or poor quality
    const needsSecondSearch = results.length < 3 || !isResultQualityGood(results, query);
    
    if (needsSecondSearch) {
      const altQuery = generateAlternativeQuery(query, isLegal);
      const altSearchQuery = isLegal ? `${altQuery} site:saflii.org OR site:justice.gov.za OR "South Africa"` : altQuery;
      
      const altSearchUrl = new URL('https://www.googleapis.com/customsearch/v1');
      altSearchUrl.searchParams.set('key', apiKey);
      altSearchUrl.searchParams.set('cx', engineId);
      altSearchUrl.searchParams.set('q', altSearchQuery);
      altSearchUrl.searchParams.set('num', Math.min(maxResults, 10).toString());
      altSearchUrl.searchParams.set('dateRestrict', 'y1');
      altSearchUrl.searchParams.set('safe', 'medium');
      altSearchUrl.searchParams.set('lr', 'lang_en');
      
      if (isLegal) {
        altSearchUrl.searchParams.set('gl', 'za');
      }
      
      const altResponse = await fetch(altSearchUrl.toString());
      
      if (altResponse.ok) {
        const altData = await altResponse.json();
        const altResults = (altData.items || []).map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          source: 'google' as const
        }));
        
        results = [...results, ...altResults];
        console.log(`[GOGGA Enhanced Search] Found ${altResults.length} additional results with alternative terms`);
      }
    }
    
    if (fetchContent && results.length > 0) {
      console.log(`[GOGGA WebSearch] Fetching content from ${Math.min(results.length, 3)} results...`);
      
      // Fetch content from top results with parallel processing
      const contentPromises = results.slice(0, 3).map(async (result: any, index: number) => {
        try {
          const content = await fetchPageContent(result.link);
          const relevanceScore = calculateRelevance(query, result.title, result.snippet, content);
          
          return { 
            ...result, 
            content,
            relevanceScore,
            summary: content ? await summarizeContent(content, query) : undefined
          };
        } catch (error) {
          console.warn(`Failed to fetch content for result ${index + 1}:`, error);
          return result;
        }
      });
      
      const resultsWithContent = await Promise.all(contentPromises);
      
      // Sort by relevance score
      resultsWithContent.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
      
      // Cache results
      searchCache.set(query, [...resultsWithContent, ...results.slice(3)], 'google');
      return [...resultsWithContent, ...results.slice(3)];
    }
    
    // Cache results
    searchCache.set(query, results, 'google');
    return results;
  } catch (error) {
    console.error('Web search error:', error);
    return [];
  }
};

// Calculate relevance score based on query match
const calculateRelevance = (query: string, title: string, snippet: string, content: string): number => {
  const queryTerms = query.toLowerCase().split(/\s+/);
  
  let score = 0;
  queryTerms.forEach(term => {
    const titleMatches = (title.toLowerCase().match(new RegExp(term, 'g')) || []).length * 3;
    const snippetMatches = (snippet.toLowerCase().match(new RegExp(term, 'g')) || []).length * 2;
    const contentMatches = (content.toLowerCase().match(new RegExp(term, 'g')) || []).length;
    
    score += titleMatches + snippetMatches + contentMatches;
  });
  
  return score;
};

// Simple content summarization using keyword extraction
const summarizeContent = async (content: string, query: string): Promise<string> => {
  if (!content || content.length < 100) return content;
  
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const queryTerms = query.toLowerCase().split(/\s+/);
  
  // Score sentences based on query term presence
  const scoredSentences = sentences.map(sentence => {
    const lowerSentence = sentence.toLowerCase();
    let score = 0;
    
    queryTerms.forEach(term => {
      if (lowerSentence.includes(term)) {
        score += 1;
      }
    });
    
    return { sentence: sentence.trim(), score };
  });
  
  // Get top 3 most relevant sentences
  const topSentences = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.sentence)
    .join('. ');
  
  return topSentences || content.slice(0, 500);
};

// Enhanced search with AI-powered content analysis
export const searchWithAIAnalysis = async (query: string, cerebrasApiKey?: string): Promise<{
  results: SearchResult[];
  analysis: string;
  sources: string[];
}> => {
  const isLegal = detectLegalQuery(query);
  const results = await enhancedSearchWeb(query, true, isLegal ? 8 : 5); // More results for legal queries
  
  if (results.length === 0) {
    return {
      results: [],
      analysis: 'No search results found.',
      sources: []
    };
  }
  
  // Combine content from all results
  const combinedContent = results
    .filter(r => r.content)
    .map((r, i) => `[Source ${i + 1}: ${r.title}]\n${r.summary || r.content}\n`)
    .join('\n---\n\n');
  
  const sources = results.map(r => `${r.title} - ${r.link}`).slice(0, 5);
  
  // If Cerebras API key is available, use AI to analyze the content
  if (cerebrasApiKey && combinedContent) {
    try {
      const analysisPrompt = `Analyze the following search results for the query "${query}" and provide a comprehensive summary:

${combinedContent}

Provide a detailed analysis that:
1. Synthesizes information from multiple sources
2. Identifies key insights and trends
3. Highlights any conflicting information
4. Provides actionable conclusions
${isLegal ? '5. For legal queries: Cite case names, court levels, and legal principles' : ''}

Keep the analysis factual and cite sources when possible.`;
      
      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cerebrasApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b',
          messages: [
            {
              role: 'system',
              content: isLegal 
                ? 'You are a legal research analyst specializing in South African law. Analyze case law and legal sources with precision.'
                : 'You are a research analyst. Analyze search results and provide comprehensive, factual summaries.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2048
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const analysis = data.choices?.[0]?.message?.content || 'Analysis failed.';
        
        return {
          results,
          analysis,
          sources
        };
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
    }
  }
  
  // Fallback: simple content combination
  const analysisPrefix = isLegal ? 'Legal Research Summary' : 'Search Results Summary';
  const analysis = `${analysisPrefix} for "${query}":\n\n${results.map((r, i) => 
    `${i + 1}. ${r.title}\n${r.summary || r.snippet}\n`
  ).join('\n')}`;
  
  return {
    results,
    analysis,
    sources
  };
};

// Cost-effective alternative using free APIs
export const searchWithFreeAPIs = async (query: string): Promise<{
  results: SearchResult[];
  summary: string;
}> => {
  // Check cache first
  const cached = searchCache.get(query);
  if (cached && cached.source !== 'google') {
    return {
      results: cached.results,
      summary: `Cached summary for "${query}"`
    };
  }
  try {
    // Use DuckDuckGo Instant Answer API (free)
    const ddgResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    const ddgData = await ddgResponse.json();
    
    // Use Wikipedia API for additional context (free)
    const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    const wikiData = wikiResponse.ok ? await wikiResponse.json() : null;
    
    const results: SearchResult[] = [];
    let summary = '';
    
    // Process DuckDuckGo results
    if (ddgData.Abstract) {
      results.push({
        title: ddgData.Heading || 'DuckDuckGo Summary',
        link: ddgData.AbstractURL || 'https://duckduckgo.com',
        snippet: ddgData.Abstract,
        content: ddgData.Abstract,
        source: 'duckduckgo' as const
      });
      summary += ddgData.Abstract + '\n\n';
    }
    
    // Add related topics
    if (ddgData.RelatedTopics) {
      ddgData.RelatedTopics.slice(0, 3).forEach((topic: any) => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related Topic',
            link: topic.FirstURL,
            snippet: topic.Text,
            content: topic.Text,
            source: 'duckduckgo' as const
          });
        }
      });
    }
    
    // Add Wikipedia summary if available
    if (wikiData && wikiData.extract) {
      results.push({
        title: wikiData.title + ' (Wikipedia)',
        link: wikiData.content_urls?.desktop?.page || 'https://wikipedia.org',
        snippet: wikiData.extract.slice(0, 200) + '...',
        content: wikiData.extract,
        source: 'wikipedia' as const
      });
      summary += `Wikipedia: ${wikiData.extract}\n\n`;
    }
    
    // Cache the results
    if (results.length > 0) {
      searchCache.set(query, results, 'free-apis');
    }
    
    return {
      results,
      summary: summary || 'No comprehensive summary available.'
    };
  } catch (error) {
    console.error('Free API search failed:', error);
    return {
      results: [],
      summary: 'Search failed with free APIs.'
    };
  }
};

// Hybrid approach: Google + Free APIs + Content Analysis
export const hybridSearch = async (query: string, options: {
  useGoogle?: boolean;
  useFreeAPIs?: boolean;
  fetchContent?: boolean;
  maxResults?: number;
} = {}): Promise<{
  results: SearchResult[];
  analysis: string;
  sources: string[];
  method: string;
}> => {
  // Check cache first
  const cached = searchCache.get(query);
  if (cached) {
    return {
      results: cached.results.slice(0, options.maxResults || 5),
      analysis: `Cached results for "${query}" (${cached.source})`,
      sources: cached.results.map(r => `${r.title} - ${r.link}`).slice(0, 5),
      method: `Cache (${cached.source})`
    };
  }
  const { useGoogle = true, useFreeAPIs = true, fetchContent = true, maxResults = 5 } = options;
  
  let allResults: SearchResult[] = [];
  let methods: string[] = [];
  
  // Try Google Search first (if configured and enabled)
  if (useGoogle) {
    try {
      const googleResults = await enhancedSearchWeb(query, fetchContent, maxResults);
      if (googleResults.length > 0) {
        allResults = [...allResults, ...googleResults];
        methods.push('GOGGA Search');
      }
    } catch (error) {
      console.warn('Google search failed, trying alternatives:', error);
    }
  }
  
  // Supplement with free APIs if needed
  if (useFreeAPIs && allResults.length < 3) {
    try {
      const freeResults = await searchWithFreeAPIs(query);
      allResults = [...allResults, ...freeResults.results];
      methods.push('GOGGA Free Search');
    } catch (error) {
      console.warn('Free API search failed:', error);
    }
  }
  
  // Remove duplicates and limit results
  const uniqueResults = allResults
    .filter((result, index, self) => 
      index === self.findIndex(r => r.link === result.link)
    )
    .slice(0, maxResults);
  
  // Generate analysis
  const analysis = uniqueResults.length > 0 
    ? `Found ${uniqueResults.length} relevant results for "${query}":\n\n${uniqueResults.map((r, i) => 
        `${i + 1}. **${r.title}**\n   ${r.summary || r.snippet}\n   Source: ${r.link}\n`
      ).join('\n')}`
    : 'No relevant results found for this query.';
  
  const sources = uniqueResults.map(r => `${r.title} - ${r.link}`);
  
  // Cache the results if we have any
  if (uniqueResults.length > 0) {
    searchCache.set(query, uniqueResults, methods[0] || 'hybrid');
  }
  
  return {
    results: uniqueResults,
    analysis,
    sources,
    method: methods.join(' + ') || 'No GOGGA search methods available'
  };
};

export const detectSearchQuery = (text: string): boolean => {
  const searchIndicators = [
    /\b(search|find|look up|google|research)\b/i,
    /\b(what is|who is|when did|where is|how much|how many)\b/i,
    /\b(latest|recent|current|new|today|now)\b/i,
    /\b(price|cost|rate|value|worth)\b/i,
    /\b(news|update|information|data|facts)\b/i,
    /\b(compare|vs|versus|difference|better)\b/i,
    /\b(review|opinion|rating|best|top)\b/i
  ];
  
  return searchIndicators.some(pattern => pattern.test(text)) ||
         (text.includes('?') && text.length > 10);
};

export const needsDeepAnalysis = (text: string): boolean => {
  return /\b(analyze|compare|detailed|comprehensive|research|study|report)\b/i.test(text) ||
         text.split(' ').length > 15;
};