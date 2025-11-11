/**
 * Example of integrating time utilities with the VCB application
 * This file demonstrates how to use timeUtils with conversationManager and other components
 */

import { ConversationManager } from './conversationManager';
import { getCurrentTime, formatTime, getTimeDifference, isTimeWithinRange } from './timeUtils';

/**
 * Enhanced Conversation Manager with time-aware features
 */
export class TimeAwareConversationManager extends ConversationManager {
  /**
   * Get conversations from a specific time period
   * @param period 'today' | 'yesterday' | 'thisWeek' | 'thisMonth'
   * @returns Array of conversations from the specified period
   */
  async getConversationsByPeriod(period: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth'): Promise<any[]> {
    const now = await getCurrentTime();
    if (!now) return [];

    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'today':
        startDate = now.startOf('day').toJSDate();
        endDate = now.endOf('day').toJSDate();
        break;
      case 'yesterday':
        startDate = now.minus({ days: 1 }).startOf('day').toJSDate();
        endDate = now.minus({ days: 1 }).endOf('day').toJSDate();
        break;
      case 'thisWeek':
        startDate = now.startOf('week').toJSDate();
        endDate = now.endOf('week').toJSDate();
        break;
      case 'thisMonth':
        startDate = now.startOf('month').toJSDate();
        endDate = now.endOf('month').toJSDate();
        break;
      default:
        return [];
    }

    // Convert to timestamps for the existing method
    return this.getConversationsByDateRange(
      startDate.getTime(),
      endDate.getTime()
    );
  }

  /**
   * Get recent conversations (within last N minutes)
   * @param minutes Number of minutes to look back
   * @returns Array of recent conversations
   */
  getRecentConversations(minutes: number = 30): any[] {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.getAllConversations().filter(conv => 
      conv.updatedAt >= cutoffTime
    );
  }

  /**
   * Format conversation timestamps with time-aware formatting
   * @param timestamp Unix timestamp
   * @returns Formatted time string
   */
  formatConversationTime(timestamp: number): string {
    const time = new Date(timestamp);
    
    // If within last 24 hours, show relative time
    if (isTimeWithinRange(time, 24 * 60)) {
      return getTimeDifference(time);
    }
    
    // Otherwise show formatted date/time
    return time.toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

/**
 * Time-aware session manager
 */
export class TimeAwareSessionManager {
  private sessionStartTime: number;
  private lastActivityTime: number;

  constructor() {
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  /**
   * Update last activity time
   */
  updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Get session duration in human-readable format
   * @returns Formatted session duration
   */
  async getSessionDuration(): Promise<string> {
    const now = await getCurrentTime();
    if (!now) {
      // Fallback to system time
      const durationMs = Date.now() - this.sessionStartTime;
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }

    const startTime = new Date(this.sessionStartTime);
    return getTimeDifference(startTime, now.toJSDate());
  }

  /**
   * Check if session is still active (last activity within 30 minutes)
   * @returns Boolean indicating if session is active
   */
  isSessionActive(): boolean {
    return isTimeWithinRange(new Date(this.lastActivityTime), 30);
  }

  /**
   * Get formatted current time for display
   * @returns Formatted current time string
   */
  async getFormattedCurrentTime(): Promise<string> {
    const currentTime = await getCurrentTime();
    if (currentTime) {
      return formatTime(currentTime, 'full');
    }
    return new Date().toLocaleString('en-ZA');
  }
}

/**
 * Example usage in the main application
 */
export const timeAwareAppExample = async (): Promise<void> => {
  console.log('=== Time-Aware Application Example ===\n');

  // Initialize enhanced conversation manager
  const timeAwareCM = new TimeAwareConversationManager();

  // Get current time in Johannesburg
  const currentTime = await getCurrentTime();
  if (currentTime) {
    console.log('Current time in Johannesburg:', formatTime(currentTime));
  }

  // Create a sample conversation
  const conversation = timeAwareCM.createConversation({
    messages: [
      {
        role: 'user',
        content: 'Hello, what time is it?',
        timestamp: Date.now()
      }
    ]
  });

  console.log('\nCreated conversation at:', timeAwareCM.formatConversationTime(conversation.createdAt));

  // Get recent conversations
  const recentConvs = timeAwareCM.getRecentConversations(60); // Last hour
  console.log(`Found ${recentConvs.length} recent conversations`);

  // Initialize session manager
  const sessionManager = new TimeAwareSessionManager();
  
  // Simulate some activity
  setTimeout(() => {
    sessionManager.updateActivity();
    console.log('\nSession updated');
  }, 2000);

  // Get session info
  const sessionDuration = await sessionManager.getSessionDuration();
  console.log(`Session duration: ${sessionDuration}`);
  console.log(`Session active: ${sessionManager.isSessionActive()}`);

  // Get formatted current time
  const formattedTime = await sessionManager.getFormattedCurrentTime();
  console.log(`Current time: ${formattedTime}`);

  // Get today's conversations
  const todaysConvs = await timeAwareCM.getConversationsByPeriod('today');
  console.log(`\nToday's conversations: ${todaysConvs.length}`);
};

// Run the example if this file is executed directly
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  timeAwareAppExample().catch(console.error);
}

/**
 * Integration points with existing App.tsx:
 * 
 * 1. Replace session time tracking with TimeAwareSessionManager
 * 2. Use formatConversationTime for better timestamp display
 * 3. Add time-aware conversation filtering features
 * 4. Use getCurrentTime for NTP-synchronized timestamps
 * 5. Implement time-based analytics and reporting
 */