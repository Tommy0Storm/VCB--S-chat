// VCB Sovereign AI Usage Tracker
// Tracks conversations, tokens, and credits according to pricing model

export type ChatType = 'lite' | 'standard' | 'premium';
export type TierType = 'starter' | 'standard' | 'pro' | 'free';

export interface UsageData {
  currentSessionStart: number;
  totalConversations: number;
  totalTokens: number;
  totalCredits: number;
  conversationHistory: {
    timestamp: number;
    tokens: number;
    credits: number;
    chatType: ChatType;
  }[];
  tier: TierType;
}

const CHAT_TYPE_CONFIG = {
  lite: { tokens: 600, credits: 1 },
  standard: { tokens: 700, credits: 4 },
  premium: { tokens: 1400, credits: 10 },
};

const TIER_LIMITS = {
  free: { lite: 5, standard: 0, premium: 0 },
  starter: { lite: 60, standard: 0, premium: 0 },
  standard: { lite: 0, standard: 150, premium: 50 },
  pro: { lite: 0, standard: 400, premium: 120 },
};

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
const STORAGE_KEY = 'vcb-ai-usage';

export class UsageTracker {
  private data: UsageData;

  constructor() {
    this.data = this.loadFromStorage();
  }

  private loadFromStorage(): UsageData {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        console.error('Failed to parse usage data:', error);
      }
    }

    // Default data
    return {
      currentSessionStart: Date.now(),
      totalConversations: 0,
      totalTokens: 0,
      totalCredits: 0,
      conversationHistory: [],
      tier: 'free',
    };
  }

  private saveToStorage(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  }

  // Check if current session is still active (within 30 min)
  private isSessionActive(): boolean {
    const elapsed = Date.now() - this.data.currentSessionStart;
    return elapsed < SESSION_TIMEOUT;
  }

  // Start new conversation session
  private startNewSession(): void {
    this.data.currentSessionStart = Date.now();
    this.data.totalConversations += 1;
    this.saveToStorage();
  }

  // Estimate token count (rough approximation: 1 token ≈ 4 characters)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Determine chat type based on token count
  private determineChatType(tokens: number): ChatType {
    if (tokens <= CHAT_TYPE_CONFIG.lite.tokens) {
      return 'lite';
    } else if (tokens <= CHAT_TYPE_CONFIG.standard.tokens) {
      return 'standard';
    } else {
      return 'premium';
    }
  }

  // Track a message exchange
  trackMessage(userMessage: string, assistantMessage: string): void {
    // Check if we need to start a new session
    if (!this.isSessionActive()) {
      this.startNewSession();
    }

    // Estimate tokens
    const userTokens = this.estimateTokens(userMessage);
    const assistantTokens = this.estimateTokens(assistantMessage);
    const totalTokens = userTokens + assistantTokens;

    // Determine chat type
    const chatType = this.determineChatType(totalTokens);
    const credits = CHAT_TYPE_CONFIG[chatType].credits;

    // Update totals
    this.data.totalTokens += totalTokens;
    this.data.totalCredits += credits;

    // Add to history
    this.data.conversationHistory.push({
      timestamp: Date.now(),
      tokens: totalTokens,
      credits,
      chatType,
    });

    this.saveToStorage();
  }

  // Get current usage summary
  getUsage(): {
    conversations: number;
    tokens: number;
    credits: number;
    sessionActive: boolean;
    sessionAge: number;
    tier: TierType;
    remainingLite: number;
    remainingStandard: number;
    remainingPremium: number;
  } {
    const sessionAge = Date.now() - this.data.currentSessionStart;
    const limits = TIER_LIMITS[this.data.tier];

    // Count conversations by type this billing cycle
    const liteCount = this.data.conversationHistory.filter(c => c.chatType === 'lite').length;
    const standardCount = this.data.conversationHistory.filter(c => c.chatType === 'standard').length;
    const premiumCount = this.data.conversationHistory.filter(c => c.chatType === 'premium').length;

    return {
      conversations: this.data.totalConversations,
      tokens: this.data.totalTokens,
      credits: this.data.totalCredits,
      sessionActive: this.isSessionActive(),
      sessionAge,
      tier: this.data.tier,
      remainingLite: Math.max(0, limits.lite - liteCount),
      remainingStandard: Math.max(0, limits.standard - standardCount),
      remainingPremium: Math.max(0, limits.premium - premiumCount),
    };
  }

  // Set user tier
  setTier(tier: TierType): void {
    this.data.tier = tier;
    this.saveToStorage();
  }

  // Reset usage (for new billing cycle)
  reset(): void {
    this.data = {
      currentSessionStart: Date.now(),
      totalConversations: 0,
      totalTokens: 0,
      totalCredits: 0,
      conversationHistory: [],
      tier: this.data.tier, // Keep tier
    };
    this.saveToStorage();
  }

  // Export usage data for telemetry
  exportTelemetry(): UsageData {
    return { ...this.data };
  }
}
