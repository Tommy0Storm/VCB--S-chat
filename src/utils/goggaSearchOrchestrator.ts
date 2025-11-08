import { multiEngineSearch } from './serpApiSearch';
import { smartSearch } from './smartSearch';

interface GOGGASearchResult {
  query: string;
  results: Array<{
    title: string;
    link: string;
    snippet: string;
    engine: string;
    relevanceScore: number;
  }>;
  synthesis: string;
  confidence: number;
  sources: string[];
  processingTime: number;
  method: string;
}

export class GOGGASearchOrchestrator {
  private cerebrasApiKey: string;

  constructor(cerebrasApiKey: string) {
    this.cerebrasApiKey = cerebrasApiKey;
  }

  async comprehensiveSearch(
    query: string,
    onProgress?: (message: string) => void
  ): Promise<GOGGASearchResult> {
    const startTime = Date.now();
    onProgress?.('GOGGA is initializing comprehensive search...');

    try {
      // Multi-engine search for diverse perspectives
      const multiResults = await multiEngineSearch(
        query, 
        ['google', 'duckduckgo', 'bing'], 
        onProgress
      );

      onProgress?.('GOGGA is synthesizing information...');

      // Enhanced AI analysis with multi-source data
      const synthesis = await this.synthesizeResults(query, multiResults.bestResults, onProgress);

      // Calculate confidence based on source diversity and result quality
      const confidence = this.calculateConfidence(multiResults);

      return {
        query,
        results: multiResults.bestResults.map((r: any, i: number) => ({
          ...r,
          engine: (r as any).engine || 'unknown',
          relevanceScore: (10 - i) / 10 // Higher score for top results
        })),
        synthesis,
        confidence,
        sources: multiResults.bestResults.map((r: any) => `${r.title} - ${r.link}`),
        processingTime: Date.now() - startTime,
        method: `GOGGA Multi-Engine (${multiResults.totalSources} sources)`
      };
    } catch (error) {
      onProgress?.('GOGGA falling back to standard search...');
      
      // Fallback to standard search
      const fallbackResult = await smartSearch.search(query, 'SERPAPI', onProgress);
      
      return {
        query,
        results: fallbackResult.results.map((r, i) => ({
          ...r,
          engine: 'fallback',
          relevanceScore: (5 - i) / 5
        })),
        synthesis: fallbackResult.analysis,
        confidence: 0.6, // Lower confidence for fallback
        sources: fallbackResult.sources,
        processingTime: Date.now() - startTime,
        method: 'GOGGA Fallback Search'
      };
    }
  }

  private async synthesizeResults(
    query: string, 
    results: any[], 
    onProgress?: (message: string) => void
  ): Promise<string> {
    const combinedContent = results
      .map((r, i) => `[${i + 1}] ${r.title} (${r.engine}): ${r.snippet}`)
      .join('\n\n');

    const synthesisPrompt = `As GOGGA, analyze these multi-engine search results for "${query}":

${combinedContent}

Provide a comprehensive synthesis that:
1. Identifies key patterns across sources
2. Highlights consensus vs conflicting information  
3. Evaluates source credibility and recency
4. Delivers actionable insights
5. Notes any gaps or limitations

Be concise but thorough. Cite sources as [1], [2], etc.`;

    try {
      onProgress?.('GOGGA is processing with advanced AI...');
      
      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.cerebrasApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b',
          messages: [
            { 
              role: 'system', 
              content: 'You are GOGGA, an advanced AI research assistant. Provide comprehensive, factual analysis with source attribution.' 
            },
            { role: 'user', content: synthesisPrompt }
          ],
          temperature: 0.2,
          max_tokens: 2000
        })
      });

      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'Synthesis unavailable';
    } catch (error) {
      console.error('AI synthesis failed:', error);
      return `Multi-engine search completed with ${results.length} results. Manual review recommended.`;
    }
  }

  private calculateConfidence(multiResults: any): number {
    const { engineStats, totalSources, bestResults } = multiResults;
    
    // Base confidence on source diversity and result quality
    const engineCount = Object.keys(engineStats).filter(k => engineStats[k] > 0).length;
    const avgResultsPerEngine = totalSources / Math.max(engineCount, 1);
    
    let confidence = 0.3; // Base confidence
    
    // Boost for multiple engines
    confidence += Math.min(engineCount * 0.2, 0.4);
    
    // Boost for good result count
    confidence += Math.min(avgResultsPerEngine * 0.05, 0.2);
    
    // Boost for result quality (snippets present)
    const qualityResults = bestResults.filter((r: any) => r.snippet && r.snippet.length > 50).length;
    confidence += Math.min(qualityResults * 0.02, 0.1);
    
    return Math.min(confidence, 1.0);
  }
}

// Export singleton instance
export const gogga = new GOGGASearchOrchestrator(
  import.meta.env.VITE_CEREBRAS_API_KEY || ''
);

// Quick access functions
export const goggaSearch = async (
  query: string, 
  onProgress?: (message: string) => void
): Promise<GOGGASearchResult> => {
  return gogga.comprehensiveSearch(query, onProgress);
};