import Dexie, { Table } from 'dexie';
import type { Message } from './conversationManager';

// User preference types
export type PreferenceValue = string | number | boolean | string[] | Record<string, string>;

// User profile interface with buddy system features
export interface UserProfile {
  id: string;
  name?: string;
  preferredLanguage?: string;
  preferredTone?: 'formal' | 'casual' | 'sarcastic' | 'professional';
  buddyPoints: number;
  totalInteractions: number;
  lastInteraction: number;
  firstInteraction: number;
  interests: string[];
  personalContext: string[]; // Rolling context, max 8K
  preferences: Record<string, PreferenceValue>;
  memories: Memory[];
  relationshipStatus?: 'new' | 'acquaintance' | 'friend' | 'bestie';
  humorPreference: boolean;
  timeZone?: string;
  location?: {
    city?: string;
    area?: string;
    country?: string;
  };
}

export interface Memory {
  id: string;
  content: string;
  type: 'personal' | 'preference' | 'experience' | 'relationship' | 'work' | 'interest';
  timestamp: number;
  importance: number; // 1-10
  keywords: string[];
}

export interface InteractionLog {
  id: string;
  userId: string;
  timestamp: number;
  messageCount: number;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  buddyPointsEarned: number;
}

class BuddySystemDB extends Dexie {
  profiles!: Table<UserProfile>;
  memories!: Table<Memory>;
  interactions!: Table<InteractionLog>;

  constructor() {
    super('gogga-buddy-system');
    
    this.version(1).stores({
      profiles: 'id, name, buddyPoints, totalInteractions, lastInteraction',
      memories: '++id, userId, type, timestamp, importance',
      interactions: '++id, userId, timestamp'
    });
  }
}

export class BuddySystem {
  private db: BuddySystemDB;
  private currentUserId: string = 'default-user';
  private contextSizeLimit = 8000; // 8K character limit

  constructor() {
    this.db = new BuddySystemDB();
  }

  // Initialize or get user profile
  async initializeUser(userId?: string): Promise<UserProfile> {
    if (userId) this.currentUserId = userId;
    
    let profile = await this.db.profiles.get(this.currentUserId);
    
    if (!profile) {
      profile = {
        id: this.currentUserId,
        buddyPoints: 0,
        totalInteractions: 0,
        lastInteraction: Date.now(),
        firstInteraction: Date.now(),
        interests: [],
        personalContext: [],
        preferences: {},
        memories: [],
        relationshipStatus: 'new',
        humorPreference: true,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      
      await this.db.profiles.add(profile);
    }
    
    return profile;
  }

  // Update user name (called when detected in conversation)
  async updateUserName(name: string): Promise<void> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (profile) {
      profile.name = name;
      await this.db.profiles.put(profile);
      await this.addMemory({
        content: `User's name is ${name}`,
        type: 'personal',
        importance: 10,
        keywords: ['name', 'identity']
      });
    }
  }

  // Add buddy points based on interaction quality
  async addBuddyPoints(points: number, reason: string): Promise<number> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (!profile) return 0;

    profile.buddyPoints += points;
    profile.totalInteractions++;
    profile.lastInteraction = Date.now();

    // Update relationship status based on buddy points
    if (profile.buddyPoints >= 1000) {
      profile.relationshipStatus = 'bestie';
    } else if (profile.buddyPoints >= 500) {
      profile.relationshipStatus = 'friend';
    } else if (profile.buddyPoints >= 100) {
      profile.relationshipStatus = 'acquaintance';
    }

    await this.db.profiles.put(profile);

    // Log the interaction
    await this.db.interactions.add({
      id: `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: this.currentUserId,
      timestamp: Date.now(),
      messageCount: 1,
      topics: [reason],
      sentiment: points > 0 ? 'positive' : 'neutral',
      buddyPointsEarned: points
    });

    console.log(`[BuddySystem] Added ${points} buddy points for: ${reason}. Total: ${profile.buddyPoints}`);
    return profile.buddyPoints;
  }

  // Add a memory/context item
  async addMemory(memory: Partial<Memory>): Promise<void> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (!profile) return;

    const newMemory: Memory = {
      id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: memory.content || '',
      type: memory.type || 'personal',
      timestamp: Date.now(),
      importance: memory.importance || 5,
      keywords: memory.keywords || []
    };

    await this.db.memories.add(newMemory);
    profile.memories.push(newMemory);

    // Manage context size - remove old low-importance items if needed
    await this.pruneContextIfNeeded(profile);
    
    await this.db.profiles.put(profile);
  }

  // Prune context to stay under 8K limit
  private async pruneContextIfNeeded(profile: UserProfile): Promise<void> {
    const contextSize = JSON.stringify(profile.personalContext).length + 
                       JSON.stringify(profile.memories).length;

    if (contextSize > this.contextSizeLimit) {
      // Sort memories by importance and recency
      profile.memories.sort((a, b) => {
        const scoreA = a.importance + (Date.now() - a.timestamp) / (1000 * 60 * 60 * 24); // Days old penalty
        const scoreB = b.importance + (Date.now() - b.timestamp) / (1000 * 60 * 60 * 24);
        return scoreB - scoreA;
      });

      // Keep only top memories
      const keepCount = Math.min(profile.memories.length, 50);
      profile.memories = profile.memories.slice(0, keepCount);

      // Also trim personal context array
      if (profile.personalContext.length > 20) {
        profile.personalContext = profile.personalContext.slice(-20); // Keep last 20
      }

      console.log('[BuddySystem] Pruned context to stay under 8K limit');
    }
  }

  // Get formatted context for AI
  async getAIContext(): Promise<string> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (!profile) return '';

    const contextParts: string[] = [];

    // Add user identity
    if (profile.name) {
      contextParts.push(`USER NAME: ${profile.name}`);
    }

    // Add relationship status and buddy points
    contextParts.push(`RELATIONSHIP: ${profile.relationshipStatus} (${profile.buddyPoints} buddy points)`);
    contextParts.push(`TOTAL INTERACTIONS: ${profile.totalInteractions}`);

    // Add preferences
    if (profile.preferredLanguage) {
      contextParts.push(`PREFERRED LANGUAGE: ${profile.preferredLanguage}`);
    }
    if (profile.preferredTone) {
      contextParts.push(`PREFERRED TONE: ${profile.preferredTone}`);
    }
    contextParts.push(`HUMOR: ${profile.humorPreference ? 'Yes, user enjoys humor' : 'No humor please'}`);

    // Add location if available
    if (profile.location?.city) {
      contextParts.push(`LOCATION: ${profile.location.city}${profile.location.area ? ', ' + profile.location.area : ''}`);
    }

    // Add interests
    if (profile.interests.length > 0) {
      contextParts.push(`INTERESTS: ${profile.interests.join(', ')}`);
    }

    // Add important memories
    const importantMemories = profile.memories
      .filter(m => m.importance >= 7)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    if (importantMemories.length > 0) {
      contextParts.push('\nIMPORTANT CONTEXT:');
      importantMemories.forEach(memory => {
        contextParts.push(`- ${memory.content} [${memory.type}]`);
      });
    }

    // Add recent context
    if (profile.personalContext.length > 0) {
      contextParts.push('\nRECENT CONTEXT:');
      profile.personalContext.slice(-5).forEach(ctx => {
        contextParts.push(`- ${ctx}`);
      });
    }

    return contextParts.join('\n');
  }

  // Track conversation patterns
  async analyzeInteractionPattern(messages: Message[]): Promise<void> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (!profile) return;

    // Extract topics and interests from messages
    const topics = new Set<string>();
    messages.forEach(msg => {
      if (msg.content) {
        // Simple keyword extraction (can be enhanced)
        const keywords = msg.content.toLowerCase().match(/\b\w{4,}\b/g) || [];
        keywords.forEach((k: string) => topics.add(k));
      }
    });

    // Update interests based on frequency
    const topicArray = Array.from(topics);
    topicArray.forEach(topic => {
      if (!profile.interests.includes(topic) && Math.random() > 0.7) {
        profile.interests.push(topic);
      }
    });

    // Keep only top 20 interests
    if (profile.interests.length > 20) {
      profile.interests = profile.interests.slice(-20);
    }

    await this.db.profiles.put(profile);
  }

  // Update preferences based on user feedback
  async updatePreference(key: string, value: PreferenceValue): Promise<void> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (!profile) return;

    profile.preferences[key] = value;
    await this.db.profiles.put(profile);

    // Special handling for language preference
    if (key === 'preferredLanguage' && typeof value === 'string') {
      profile.preferredLanguage = value;
    } else if (key === 'preferredTone' && typeof value === 'string') {
      profile.preferredTone = value as 'formal' | 'casual' | 'sarcastic' | 'professional';
    } else if (key === 'humorPreference' && typeof value === 'boolean') {
      profile.humorPreference = value;
    }
  }

  // Get buddy system stats
  async getStats(): Promise<{
    buddyPoints: number;
    relationshipStatus: string;
    totalInteractions: number;
    daysSinceFirstInteraction: number;
    memoriesCount: number;
  }> {
    const profile = await this.db.profiles.get(this.currentUserId);
    if (!profile) {
      return {
        buddyPoints: 0,
        relationshipStatus: 'new',
        totalInteractions: 0,
        daysSinceFirstInteraction: 0,
        memoriesCount: 0
      };
    }

    const daysSinceFirst = Math.floor((Date.now() - profile.firstInteraction) / (1000 * 60 * 60 * 24));

    return {
      buddyPoints: profile.buddyPoints,
      relationshipStatus: profile.relationshipStatus || 'new',
      totalInteractions: profile.totalInteractions,
      daysSinceFirstInteraction: daysSinceFirst,
      memoriesCount: profile.memories.length
    };
  }

  // Health check for Dexie database
  async healthCheck(): Promise<{
    isHealthy: boolean;
    dbSize?: number;
    profileCount?: number;
    memoryCount?: number;
    error?: string;
  }> {
    try {
      const profiles = await this.db.profiles.count();
      const memories = await this.db.memories.count();
      const interactions = await this.db.interactions.count();

      // Estimate size (rough calculation)
      const estimatedSize = profiles * 2000 + memories * 500 + interactions * 200;

      return {
        isHealthy: true,
        dbSize: estimatedSize,
        profileCount: profiles,
        memoryCount: memories
      };
    } catch (error) {
      console.error('[BuddySystem] Health check failed:', error);
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Clear all data (for testing or user request)
  async clearAllData(): Promise<void> {
    await this.db.profiles.clear();
    await this.db.memories.clear();
    await this.db.interactions.clear();
    console.log('[BuddySystem] All data cleared');
  }
}

// Export singleton instance
export const buddySystem = new BuddySystem();