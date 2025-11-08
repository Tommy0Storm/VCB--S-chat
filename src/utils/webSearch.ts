interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
}

const fetchPageContent = async (url: string): Promise<string> => {
  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, 'text/html');
    
    // Remove scripts, styles, nav, footer
    ['script', 'style', 'nav', 'footer', 'header'].forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });
    
    const textContent = doc.body?.textContent || '';
    return textContent.replace(/\s+/g, ' ').trim().slice(0, 2000); // Limit to 2000 chars
  } catch {
    return '';
  }
};

const detectLegalQuery = (query: string): boolean => {
  const legalKeywords = [
    'case law', 'court', 'judgment', 'precedent', 'statute', 'act', 'section',
    'constitutional', 'supreme court', 'high court', 'magistrate', 'ccma',
    'labour court', 'tribunal', 'legal', 'law', 'litigation', 'appeal',
    'criminal', 'civil', 'contract', 'delict', 'tort', 'damages', 'sca',
    'constitutional court', 'labour relations act', 'lra', 'bcea'
  ];
  
  return legalKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  );
};

const sanitizeQuery = (query: string): string => {
  return query
    .replace(/[<>"'&]/g, '') // Remove potential XSS chars
    .trim()
    .slice(0, 500); // Limit query length
};

const validateSearchInputs = (query: string, apiKey: string, engineId: string): void => {
  if (!query?.trim()) throw new Error('Search query is required');
  if (!apiKey) throw new Error('API key not configured');
  if (!engineId) throw new Error('Search engine ID not configured');
  if (query.length > 500) throw new Error('Query too long');
};

export const searchWeb = async (
  query: string, 
  fetchContent = false,
  onProgress?: (progress: string, results?: SearchResult[]) => void
): Promise<SearchResult[]> => {
  const sanitizedQuery = sanitizeQuery(query);
  const apiKey = import.meta.env.VITE_GOOGLE_SEARCH_API_KEY;
  const isLegal = detectLegalQuery(sanitizedQuery);
  const engineId = isLegal 
    ? import.meta.env.VITE_LEGAL_SEARCH_ENGINE_ID
    : import.meta.env.VITE_GOOGLE_SEARCH_ENGINE_ID;
  
  validateSearchInputs(sanitizedQuery, apiKey, engineId);

  const maxRetries = 3;
  // let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      onProgress?.(`GOGGA is searching ${isLegal ? 'SA legal databases' : 'web'}...`);
      
      // Add South African context to legal queries
      const searchQuery = isLegal ? `${sanitizedQuery} site:saflii.org OR site:justice.gov.za OR "South Africa"` : sanitizedQuery;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(searchQuery)}&num=10&gl=za&hl=en`,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 429 && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw new Error(`Search failed: ${response.status}`);
      }
    
    const data = await response.json();
    const results = (data.items || []).map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));
    
    onProgress?.(`GOGGA found ${results.length} results`, results);
    
    // Second search if results are insufficient or poor quality
    const needsSecondSearch = results.length < 3 || !isResultQualityGood(results, query);
    
    if (needsSecondSearch) {
      onProgress?.('GOGGA is trying alternative search terms...');
      
      const altQuery = generateAlternativeQuery(query, isLegal);
      const altSearchQuery = isLegal ? `${altQuery} site:saflii.org OR site:justice.gov.za OR "South Africa"` : altQuery;
      
      const altResponse = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(altSearchQuery)}&num=10&gl=za&hl=en`
      );
      
      if (altResponse.ok) {
        const altData = await altResponse.json();
        const altResults = (altData.items || []).map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        }));
        
        results.push(...altResults);
        onProgress?.(`GOGGA found ${altResults.length} additional results`, altResults);
      }
    }
    
    if (fetchContent) {
      onProgress?.('GOGGA is analyzing content...');
      const contentPromises = results.slice(0, 3).map(async (result: any) => {
        const content = await fetchPageContent(result.link);
        return { ...result, content };
      });
      
      const resultsWithContent = await Promise.all(contentPromises);
      onProgress?.('GOGGA completed content analysis');
      return [...resultsWithContent, ...results.slice(3)];
    }
    
    console.log(`[GOGGA Search] Using ${isLegal ? 'Legal (SA)' : 'General'} search engine`);
    console.log(`[GOGGA Search] Engine ID: ${engineId?.slice(0, 8)}...`);
    console.log(`[GOGGA Search] Query length: ${searchQuery.length} chars`);
    return results;
      // Success - break retry loop
      break;
    } catch (error) {
      // lastError = error as Error;
      console.error(`[GOGGA Search] Attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('[GOGGA Search] All retry attempts failed');
        return [];
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return [];
};

export const detectSearchQuery = (text: string): boolean => {
  return /\b(search|find|look up|what is|who is|when did|where is|how much|latest|news|current|price|cost|today)\b/i.test(text) ||
         text.includes('?') && text.length > 10;
};

const isResultQualityGood = (results: any[], query: string): boolean => {
  if (results.length === 0) return false;
  
  const queryTerms = query.toLowerCase().split(/\s+/);
  let relevantResults = 0;
  
  results.forEach(result => {
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

export const needsDeepAnalysis = (text: string): boolean => {
  return /\b(analyze|compare|detailed|comprehensive|research|study|report)\b/i.test(text) ||
         text.split(' ').length > 15;
};