export interface SerpApiResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  source?: string;
  date?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  address?: string;
  type?: string;
  gps_coordinates?: { latitude: number; longitude: number };
}

interface LocalPlace {
  position: number;
  title: string;
  rating?: number;
  reviews?: number;
  price?: string;
  description?: string;
  thumbnail?: string;
  address?: string;
  type?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  place_id?: string;
}

interface LocalMapData {
  image?: string;
  gps_coordinates?: { latitude: number; longitude: number };
}

interface SerpApiResponse {
  organic_results?: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
    source?: string;
    date?: string;
    thumbnail?: string;
  }>;
  results?: Array<{
    title: string;
    link: string;
    body?: string;
    snippet?: string;
    position: number;
    displayed_link?: string;
  }>;
  local_results?: {
    places?: LocalPlace[];
  };
  local_map?: LocalMapData;
  related_searches?: Array<{ query: string }>;
  people_also_ask?: Array<{ question: string; snippet: string; link: string }>;
  knowledge_graph?: {
    title: string;
    description: string;
    source: string;
  };
}

const sanitizeSerpQuery = (query: string): string => {
  return query
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, 500);
};

export const searchWithSerpApi = async (query: string, options: {
  maxResults?: number;
  location?: string;
  language?: string;
  device?: 'desktop' | 'mobile';
  engine?: 'google' | 'duckduckgo' | 'bing' | 'yahoo';
  coordinates?: string; // Format: "lat,lon"
} = {}): Promise<{
  results: SerpApiResult[];
  localPlaces?: LocalPlace[];
  mapImage?: string;
  mapCoordinates?: { latitude: number; longitude: number };
  relatedQueries: string[];
  peopleAlsoAsk: Array<{ question: string; answer: string }>;
  knowledgeGraph?: { title: string; description: string };
  engine: string;
}> => {
  const sanitizedQuery = sanitizeSerpQuery(query);
  const apiKey = import.meta.env.VITE_SERPAPI_KEY;
  
  if (!apiKey) {
    throw new Error('SerpAPI key not configured');
  }
  
  if (!sanitizedQuery.trim()) {
    throw new Error('Search query is required');
  }

  const engine = options.engine || 'google';
  const baseParams: Record<string, string> = {
    engine,
    q: sanitizedQuery,
    api_key: apiKey,
    num: Math.min(options.maxResults || 10, 20).toString()
  };
  
  // Add location coordinates if provided (for local results)
  if (options.coordinates) {
    baseParams.location = options.coordinates;
    baseParams.uule = `w+CAIQICI${btoa(options.coordinates)}`; // Google location encoding
  }
  
  // Engine-specific parameters
  const engineParams = (() => {
    switch (engine) {
      case 'duckduckgo':
        return { ...baseParams, kl: options.location || 'za-en', safe_search: 'moderate', no_redirect: '1' };
      case 'bing':
        return { ...baseParams, cc: options.location || 'ZA', mkt: options.language || 'en-ZA', safesearch: 'moderate' };
      case 'yahoo':
        return { ...baseParams, p: baseParams.q, vs: options.location || 'za', vl: options.language || 'en' };
      default: // google
        return { ...baseParams, gl: options.location || 'za', hl: options.language || 'en', device: options.device || 'desktop', google_domain: 'google.co.za', safe: 'medium' };
    }
  })();
  
  const params = new URLSearchParams(engineParams);

  try {
    // Use CORS proxy for production deployment
    const corsProxy = 'https://corsproxy.io/?';
    const apiUrl = `https://serpapi.com/search?${params}`;
    const response = await fetch(`${corsProxy}${encodeURIComponent(apiUrl)}`);
    
    if (!response.ok) {
      throw new Error(`SerpAPI error: ${response.status}`);
    }

    const data: SerpApiResponse = await response.json();
    
    // Handle different response formats for different engines
    const organicResults = engine === 'duckduckgo' 
      ? (data.results || data.organic_results || [])
      : (data.organic_results || []);
    
    const relatedSearches = data.related_searches || [];
    const localPlaces = data.local_results?.places || [];
    const localMap = data.local_map;

    return {
      results: organicResults.map((item: { title: string; link: string; snippet?: string; body?: string; description?: string; position?: number; source?: string; date?: string; thumbnail?: string }, index: number) => ({
        title: item.title,
        link: item.link,
        snippet: (item.snippet || item.body || item.description || '').trim(),
        position: item.position || index + 1,
        source: item.source || (item as { displayed_link?: string; cite?: { domain?: string } }).displayed_link || (item as { cite?: { domain?: string } }).cite?.domain || '',
        date: item.date || '',
        thumbnail: item.thumbnail || ''
      })),
      localPlaces: localPlaces.length > 0 ? localPlaces : undefined,
      mapImage: localMap?.image,
      mapCoordinates: localMap?.gps_coordinates,
      relatedQueries: relatedSearches.map((r: { query: string }) => r.query || ''),
      peopleAlsoAsk: (data.people_also_ask || []).map((p: { question: string; snippet?: string; answer?: string }) => ({
        question: p.question,
        answer: (p.snippet || p.answer || '').trim()
      })),
      knowledgeGraph: data.knowledge_graph ? {
        title: data.knowledge_graph.title,
        description: data.knowledge_graph.description
      } : undefined,
      engine
    };
  } catch (error) {
    console.error('SerpAPI search failed:', error);
    throw error;
  }
};

// Multi-engine search for comprehensive results
export const multiEngineSearch = async (
  query: string,
  engines: ('google' | 'duckduckgo' | 'bing' | 'yahoo')[] = ['google', 'duckduckgo'],
  onProgress?: (message: string) => void,
  coordinates?: string
): Promise<{
  allResults: Array<SerpApiResult & { engine: string }>;
  bestResults: SerpApiResult[];
  engineStats: Record<string, number>;
  totalSources: number;
}> => {
  const allResults: Array<SerpApiResult & { engine: string }> = [];
  const engineStats: Record<string, number> = {};

  for (const engine of engines) {
    try {
      onProgress?.(`GOGGA scanning ${engine.toUpperCase()}...`);
      const result = await searchWithSerpApi(query, { maxResults: 5, engine, coordinates });
      
      const engineResults = result.results.map(r => ({ ...r, engine }));
      allResults.push(...engineResults);
      engineStats[engine] = result.results.length;
    } catch (error) {
      console.warn(`Engine ${engine} failed:`, error);
      engineStats[engine] = 0;
    }
  }

  // Deduplicate and rank results
  const uniqueResults = allResults.filter((result, index, self) => 
    index === self.findIndex(r => r.link === result.link)
  );

  // Sort by relevance (position and engine priority)
  const bestResults = uniqueResults
    .sort((a, b) => {
      const enginePriority = { google: 4, bing: 3, duckduckgo: 2, yahoo: 1 };
      return (enginePriority[a.engine as keyof typeof enginePriority] || 0) - 
             (enginePriority[b.engine as keyof typeof enginePriority] || 0) + 
             (a.position - b.position);
    })
    .slice(0, 8);

  return {
    allResults,
    bestResults,
    engineStats,
    totalSources: uniqueResults.length
  };
};

export const searchWithSerpApiAndAI = async (
  query: string, 
  cerebrasApiKey: string,
  onProgress?: (message: string) => void,
  useEngine: 'google' | 'duckduckgo' | 'bing' | 'yahoo' = 'google',
  coordinates?: string // Format: "lat,lon"
): Promise<{
  searchResults: SerpApiResult[];
  localPlaces?: LocalPlace[];
  mapImage?: string;
  mapCoordinates?: { latitude: number; longitude: number };
  aiAnalysis: string;
  sources: string[];
  relatedQueries: string[];
  engine: string;
}> => {
  // Enhanced multi-engine search with intelligent fallback
  const engines: ('google' | 'duckduckgo' | 'bing' | 'yahoo')[] = [useEngine];
  if (useEngine !== 'google') engines.push('google');
  if (useEngine !== 'duckduckgo') engines.push('duckduckgo');
  
  onProgress?.(`GOGGA is aggregating data from multiple sources...`);
  
  let serpResults;
  let usedEngine = useEngine;
  
  try {
    // Try multi-engine search for comprehensive results
    const multiResults = await multiEngineSearch(query, engines.slice(0, 2), onProgress, coordinates);
    
    if (multiResults.bestResults.length > 0) {
      serpResults = {
        results: multiResults.bestResults,
        relatedQueries: [],
        peopleAlsoAsk: [],
        knowledgeGraph: undefined
      };
      usedEngine = useEngine;
    } else {
      throw new Error('No results from multi-engine search');
    }
  } catch (error) {
    console.warn('[Multi-Engine] Failed, trying single engine:', error);
    onProgress?.(`GOGGA falling back to ${useEngine.toUpperCase()}...`);
    
    try {
      serpResults = await searchWithSerpApi(query, { maxResults: 5, engine: useEngine });
      usedEngine = useEngine;
    } catch (singleError) {
      throw new Error(`All search methods failed: ${error}`);
    }
  }
  
  // If we have local places, prioritize them in the response
  if (serpResults.localPlaces && serpResults.localPlaces.length > 0) {
    onProgress?.(`GOGGA found ${serpResults.localPlaces.length} local places nearby!`);
  }
  
  onProgress?.('GOGGA is analyzing search results...');
  
  // Combine all content for AI analysis
  const combinedContent = [
    serpResults.knowledgeGraph ? `Knowledge Graph: ${serpResults.knowledgeGraph.description}` : '',
    ...serpResults.results.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`),
    ...serpResults.peopleAlsoAsk.map(p => `Q: ${p.question} A: ${p.answer}`)
  ].filter(Boolean).join('\n\n');

  // AI analysis using Cerebras
  const analysisPrompt = `Analyze these search results for "${query}" (via ${usedEngine.toUpperCase()}) and provide a comprehensive summary:

${combinedContent}

Provide:
1. Key findings and insights
2. Synthesis of information from multiple sources
3. Any conflicting information
4. Actionable conclusions

Be factual and cite sources by number [1], [2], etc.`;

  try {
    onProgress?.('GOGGA is thinking deeply...');
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cerebrasApiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b',
        messages: [
          { role: 'system', content: 'You are a research analyst. Provide comprehensive, factual analysis of search results.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    const aiData = await response.json();
    const analysis = aiData.choices?.[0]?.message?.content || 'AI analysis failed';
    
    onProgress?.('GOGGA has completed the analysis!');

    return {
      searchResults: serpResults.results,
      localPlaces: serpResults.localPlaces,
      mapImage: serpResults.mapImage,
      mapCoordinates: serpResults.mapCoordinates,
      aiAnalysis: analysis,
      sources: serpResults.results.map(r => `${r.title} - ${r.link}`),
      relatedQueries: serpResults.relatedQueries,
      engine: usedEngine
    };
  } catch (error) {
    console.error('AI analysis failed:', error);
    onProgress?.('GOGGA encountered an issue but found results!');
    return {
      searchResults: serpResults.results,
      localPlaces: serpResults.localPlaces,
      mapImage: serpResults.mapImage,
      mapCoordinates: serpResults.mapCoordinates,
      aiAnalysis: `Search completed using ${usedEngine} but AI analysis failed. Found ${serpResults.results.length} results.`,
      sources: serpResults.results.map(r => `${r.title} - ${r.link}`),
      relatedQueries: serpResults.relatedQueries,
      engine: usedEngine
    };
  }
};