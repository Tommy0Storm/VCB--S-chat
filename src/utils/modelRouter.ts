// Model Router Configuration System
// Optimized for token usage and context management

import type { Message } from './conversationManager';

export type ModelType = 'llama' | 'cepo' | 'qwen-instruct' | 'qwen-thinking';

export interface ModelConfig {
  id: string;
  name: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  description: string;
  useCases: string[];
  tokenCost: number; // Cost per 1K tokens
  contextLimit: number; // Max context window
}

export interface RoutingCriteria {
  wordCount: { min: number; max: number };
  keywords: string[];
  patterns: RegExp[];
  complexity: number; // 1-10 scale
}

export interface ModelRoute {
  model: ModelType;
  criteria: RoutingCriteria;
  priority: number; // Higher number = higher priority
}

// Model configurations with optimized token settings
export const MODEL_CONFIGS: Record<ModelType, ModelConfig> = {
  'llama': {
    id: 'llama',
    name: 'Llama 3.3 70B',
    model: 'llama-3.3-70b',
    maxTokens: 2048, // Reduced for basic queries
    temperature: 0.7,
    topP: 0.9,
    description: 'Fast, efficient for simple queries',
    useCases: ['greetings', 'simple questions', 'basic chat', 'quick facts'],
    tokenCost: 0.001,
    contextLimit: 8192
  },
  'cepo': {
    id: 'cepo',
    name: 'CePO Enhanced Llama',
    model: 'llama-3.3-70b', // Same model but with CePO pipeline
    maxTokens: 3072, // More tokens for complex reasoning
    temperature: 0.5,
    topP: 0.85,
    description: 'Multi-stage reasoning for complex problems',
    useCases: ['complex analysis', 'multi-step problems', 'detailed recipes', 'planning'],
    tokenCost: 0.004, // 4x cost due to multiple stages
    contextLimit: 8192
  },
  'qwen-instruct': {
    id: 'qwen-instruct',
    name: 'Qwen 235B Instruct',
    model: 'qwen-3-235b-a22b-instruct-2507',
    maxTokens: 4096,
    temperature: 0.3,
    topP: 0.85,
    description: 'Legal expertise and complex technical analysis',
    useCases: ['legal questions', 'contracts', 'technical documentation', 'regulations'],
    tokenCost: 0.003,
    contextLimit: 16384
  },
  'qwen-thinking': {
    id: 'qwen-thinking',
    name: 'Qwen 235B Thinking',
    model: 'qwen-3-235b-a22b-thinking-2507',
    maxTokens: 4096,
    temperature: 0.0,
    topP: 0.85,
    description: 'Deep reasoning with step-by-step thought process',
    useCases: ['very complex problems', 'philosophical questions', 'strategic planning', 'deep analysis'],
    tokenCost: 0.005,
    contextLimit: 32768
  }
};

// Routing rules with priority system
export const ROUTING_RULES: ModelRoute[] = [
  // Trivial queries -> Llama
  {
    model: 'llama',
    criteria: {
      wordCount: { min: 1, max: 5 },
      keywords: ['hi', 'hello', 'hey', 'thanks', 'bye', 'yes', 'no', 'ok'],
      patterns: [/^(hi|hello|hey|thanks|bye|yes|no|ok|sure)$/i],
      complexity: 1
    },
    priority: 10
  },
  
  // Legal queries -> Qwen Instruct
  {
    model: 'qwen-instruct',
    criteria: {
      wordCount: { min: 0, max: Infinity },
      keywords: ['law', 'legal', 'contract', 'court', 'ccma', 'labour', 'regulation', 'compliance', 'statute'],
      patterns: [
        /\b(law|legal|court|contract|regulation|compliance|statute|litigation|tribunal)\b/i,
        /\b(ccma|labour court|high court|magistrate|constitutional court)\b/i
      ],
      complexity: 8
    },
    priority: 9
  },
  
  // Very complex queries -> Qwen Thinking
  {
    model: 'qwen-thinking',
    criteria: {
      wordCount: { min: 30, max: Infinity },
      keywords: ['analyze', 'explain', 'compare', 'evaluate', 'strategy', 'philosophy'],
      patterns: [
        /\b(why|how|what if|explain in detail|analyze|compare and contrast)\b/i,
        /\b(implications|consequences|philosophical|strategic planning)\b/i,
        /\b(step by step|thoroughly|comprehensive analysis)\b/i
      ],
      complexity: 9
    },
    priority: 8
  },
  
  // Complex multi-step -> CePO
  {
    model: 'cepo',
    criteria: {
      wordCount: { min: 15, max: Infinity },
      keywords: ['plan', 'strategy', 'recipe', 'steps', 'process', 'calculation'],
      patterns: [
        /\b(multiple|several|various|complex|detailed)\b/i,
        /\b(calculate|solve|optimize|plan|design)\b/i,
        /\b(recipe|instructions|guide|tutorial)\b/i
      ],
      complexity: 7
    },
    priority: 7
  },
  
  // Default to Llama for everything else
  {
    model: 'llama',
    criteria: {
      wordCount: { min: 0, max: Infinity },
      keywords: [],
      patterns: [],
      complexity: 3
    },
    priority: 1
  }
];

export class ModelRouter {
  private tokenUsage: Map<ModelType, number> = new Map();
  private requestCount: Map<ModelType, number> = new Map();
  
  constructor() {
    // Initialize counters
    for (const model of Object.keys(MODEL_CONFIGS) as ModelType[]) {
      this.tokenUsage.set(model, 0);
      this.requestCount.set(model, 0);
    }
  }
  
  /**
   * Route a query to the appropriate model based on content analysis
   */
  routeQuery(
    query: string,
    forceModel?: ModelType,
    conversationContext?: { messageCount: number; totalTokens: number }
  ): {
    model: ModelType;
    config: ModelConfig;
    reasoning: string;
  } {
    // Handle forced model selection
    if (forceModel) {
      return {
        model: forceModel,
        config: MODEL_CONFIGS[forceModel],
        reasoning: `User forced ${forceModel} model`
      };
    }
    
    const wordCount = query.split(/\s+/).length;
    const lowerQuery = query.toLowerCase();
    
    // Evaluate all routing rules
    const matches = ROUTING_RULES
      .filter(rule => this.matchesCriteria(query, lowerQuery, wordCount, rule.criteria))
      .sort((a, b) => b.priority - a.priority);
    
    // Get the highest priority match
    const selectedRoute = matches[0] || ROUTING_RULES[ROUTING_RULES.length - 1];
    
    // Context-based optimization: Use smaller models for long conversations
    let selectedModel = selectedRoute.model;
    if (conversationContext && conversationContext.totalTokens > 50000) {
      // Switch to more efficient models for long conversations
      if (selectedModel === 'qwen-thinking') {
        selectedModel = 'qwen-instruct';
      } else if (selectedModel === 'cepo') {
        selectedModel = 'llama';
      }
    }
    
    return {
      model: selectedModel,
      config: MODEL_CONFIGS[selectedModel],
      reasoning: this.generateReasoning(query, selectedRoute)
    };
  }
  
  /**
   * Check if query matches routing criteria
   */
  private matchesCriteria(
    query: string,
    lowerQuery: string,
    wordCount: number,
    criteria: RoutingCriteria
  ): boolean {
    // Check word count
    if (wordCount < criteria.wordCount.min || wordCount > criteria.wordCount.max) {
      return false;
    }
    
    // Check keywords (if any specified)
    if (criteria.keywords.length > 0) {
      const hasKeyword = criteria.keywords.some(keyword => lowerQuery.includes(keyword));
      if (hasKeyword) return true;
    }
    
    // Check patterns (if any specified)
    if (criteria.patterns.length > 0) {
      const matchesPattern = criteria.patterns.some(pattern => pattern.test(query));
      if (matchesPattern) return true;
    }
    
    // If no keywords or patterns specified, match by default
    return criteria.keywords.length === 0 && criteria.patterns.length === 0;
  }
  
  /**
   * Generate reasoning for model selection
   */
  private generateReasoning(query: string, route: ModelRoute): string {
    const wordCount = query.split(/\s+/).length;
    const config = MODEL_CONFIGS[route.model];
    
    return `Selected ${config.name} (${wordCount} words, complexity: ${route.criteria.complexity}/10). ${config.description}.`;
  }
  
  /**
   * Track token usage for a model
   */
  trackUsage(model: ModelType, tokens: number): void {
    const currentUsage = this.tokenUsage.get(model) || 0;
    const currentCount = this.requestCount.get(model) || 0;
    
    this.tokenUsage.set(model, currentUsage + tokens);
    this.requestCount.set(model, currentCount + 1);
  }
  
  /**
   * Get usage statistics
   */
  getUsageStats(): {
    model: ModelType;
    requests: number;
    tokens: number;
    estimatedCost: number;
  }[] {
    const stats = [];
    
    for (const [model, config] of Object.entries(MODEL_CONFIGS) as [ModelType, ModelConfig][]) {
      const tokens = this.tokenUsage.get(model) || 0;
      const requests = this.requestCount.get(model) || 0;
      const cost = (tokens / 1000) * config.tokenCost;
      
      stats.push({
        model,
        requests,
        tokens,
        estimatedCost: cost
      });
    }
    
    return stats.sort((a, b) => b.tokens - a.tokens);
  }
  
  /**
   * Reset usage statistics
   */
  resetStats(): void {
    for (const model of Object.keys(MODEL_CONFIGS) as ModelType[]) {
      this.tokenUsage.set(model, 0);
      this.requestCount.set(model, 0);
    }
  }
  
  /**
   * Optimize context for token efficiency
   */
  optimizeContext(
    messages: Message[],
    maxTokens: number
  ): { messages: Message[]; removedCount: number } {
    // Simple strategy: Keep most recent messages that fit in token budget
    // More sophisticated strategies could summarize older messages
    
    let totalTokens = 0;
    const optimizedMessages = [];
    let removedCount = 0;
    
    // Work backwards from most recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageTokens = this.estimateTokens(messages[i].content);
      
      if (totalTokens + messageTokens <= maxTokens) {
        optimizedMessages.unshift(messages[i]);
        totalTokens += messageTokens;
      } else {
        removedCount++;
      }
    }
    
    return { messages: optimizedMessages, removedCount };
  }
  
  /**
   * Estimate token count for a string
   */
  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

// Singleton instance
export const modelRouter = new ModelRouter();