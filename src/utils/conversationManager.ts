// VCB Sovereign AI Conversation Manager
// Manages chat history, persistence, search, and organization

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  type?: 'text' | 'image';
  imageUrl?: string;
  imagePrompt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
  tags: string[];
}

const STORAGE_KEY = 'vcb-conversations';

export class ConversationManager {
  private conversations: Map<string, Conversation>;

  constructor() {
    this.conversations = this.loadFromStorage();
  }

  // Generate unique ID
  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Load conversations from localStorage
  private loadFromStorage(): Map<string, Conversation> {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        return new Map(Object.entries(data));
      } catch (error) {
        console.error('Failed to parse conversations:', error);
      }
    }
    return new Map();
  }

  // Save conversations to localStorage
  private saveToStorage(): void {
    try {
      const data = Object.fromEntries(this.conversations);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save conversations:', error);
      // If storage is full, remove oldest non-pinned conversation
      this.cleanupOldConversations();
    }
  }

  // Remove oldest non-pinned conversations if storage is full
  private cleanupOldConversations(): void {
    const sorted = this.getAllConversations()
      .filter(c => !c.isPinned)
      .sort((a, b) => a.updatedAt - b.updatedAt);

    if (sorted.length > 0) {
      this.deleteConversation(sorted[0].id);
      console.log('Removed oldest conversation to free storage');
    }
  }

  // Auto-generate title from first user message
  private generateTitle(messages: Message[]): string {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const preview = firstUserMsg.content.substring(0, 50);
      return preview.length < firstUserMsg.content.length
        ? `${preview}...`
        : preview;
    }
    return 'New Conversation';
  }

  // Create new conversation
  createConversation(messages: Message[] = [], customTitle?: string): Conversation {
    const id = this.generateId();
    const title = customTitle || this.generateTitle(messages);
    const now = Date.now();

    const conversation: Conversation = {
      id,
      title,
      messages,
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      tags: [],
    };

    this.conversations.set(id, conversation);
    this.saveToStorage();
    console.log('Created conversation:', id, title);
    return conversation;
  }

  // Update existing conversation
  updateConversation(id: string, messages: Message[]): Conversation | null {
    const conv = this.conversations.get(id);
    if (!conv) {
      console.error('Conversation not found:', id);
      return null;
    }

    conv.messages = messages;
    conv.updatedAt = Date.now();

    // Update title if it's still auto-generated
    if (!conv.title || conv.title === 'New Conversation' || conv.title.endsWith('...')) {
      conv.title = this.generateTitle(messages);
    }

    this.saveToStorage();
    return conv;
  }

  // Rename conversation
  renameConversation(id: string, newTitle: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;

    conv.title = newTitle;
    conv.updatedAt = Date.now();
    this.saveToStorage();
    console.log('Renamed conversation:', id, newTitle);
    return true;
  }

  // Toggle pin status
  togglePin(id: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;

    conv.isPinned = !conv.isPinned;
    conv.updatedAt = Date.now();
    this.saveToStorage();
    console.log('Toggled pin:', id, conv.isPinned);
    return conv.isPinned;
  }

  // Add tag to conversation
  addTag(id: string, tag: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;

    if (!conv.tags.includes(tag)) {
      conv.tags.push(tag);
      conv.updatedAt = Date.now();
      this.saveToStorage();
    }
    return true;
  }

  // Remove tag from conversation
  removeTag(id: string, tag: string): boolean {
    const conv = this.conversations.get(id);
    if (!conv) return false;

    conv.tags = conv.tags.filter(t => t !== tag);
    conv.updatedAt = Date.now();
    this.saveToStorage();
    return true;
  }

  // Get conversation by ID
  getConversation(id: string): Conversation | null {
    return this.conversations.get(id) || null;
  }

  // Get all conversations sorted by date (pinned first)
  getAllConversations(): Conversation[] {
    const convs = Array.from(this.conversations.values());
    return convs.sort((a, b) => {
      // Pinned first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then by update date (newest first)
      return b.updatedAt - a.updatedAt;
    });
  }

  // Search conversations by title or content
  searchConversations(query: string): Conversation[] {
    if (!query.trim()) return this.getAllConversations();

    const lowerQuery = query.toLowerCase();
    return this.getAllConversations().filter(conv => {
      // Search in title
      if (conv.title.toLowerCase().includes(lowerQuery)) return true;

      // Search in messages
      return conv.messages.some(msg =>
        msg.content.toLowerCase().includes(lowerQuery)
      );
    });
  }

  // Get conversations by tag
  getConversationsByTag(tag: string): Conversation[] {
    return this.getAllConversations().filter(conv =>
      conv.tags.includes(tag)
    );
  }

  // Get conversations from date range
  getConversationsByDateRange(startDate: number, endDate: number): Conversation[] {
    return this.getAllConversations().filter(conv =>
      conv.createdAt >= startDate && conv.createdAt <= endDate
    );
  }

  // Delete conversation
  deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) {
      this.saveToStorage();
      console.log('Deleted conversation:', id);
    }
    return deleted;
  }

  // Clear all conversations (with confirmation)
  clearAll(): void {
    this.conversations.clear();
    this.saveToStorage();
    console.log('Cleared all conversations');
  }

  // Export conversation to JSON
  exportToJSON(id: string): string | null {
    const conv = this.conversations.get(id);
    if (!conv) return null;

    return JSON.stringify(conv, null, 2);
  }

  // Export conversation to plain text
  exportToText(id: string): string | null {
    const conv = this.conversations.get(id);
    if (!conv) return null;

    let text = `${conv.title}\n`;
    text += `Created: ${new Date(conv.createdAt).toLocaleString()}\n`;
    text += `Updated: ${new Date(conv.updatedAt).toLocaleString()}\n`;
    if (conv.tags.length > 0) {
      text += `Tags: ${conv.tags.join(', ')}\n`;
    }
    text += '\n' + '='.repeat(50) + '\n\n';

    conv.messages.forEach(msg => {
      const role = msg.role === 'user' ? 'YOU' : 'VCB-AI';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      text += `[${time}] ${role}:\n${msg.content}\n\n`;
    });

    return text;
  }

  // Export all conversations to JSON
  exportAllToJSON(): string {
    const data = Object.fromEntries(this.conversations);
    return JSON.stringify(data, null, 2);
  }

  // Import conversations from JSON
  importFromJSON(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      const imported = new Map(Object.entries(data));

      // Merge with existing conversations (don't overwrite)
      imported.forEach((conv, id) => {
        if (!this.conversations.has(id)) {
          this.conversations.set(id, conv as Conversation);
        }
      });

      this.saveToStorage();
      console.log('Imported conversations:', imported.size);
      return true;
    } catch (error) {
      console.error('Failed to import conversations:', error);
      return false;
    }
  }

  // Get statistics
  getStats(): {
    total: number;
    pinned: number;
    totalMessages: number;
    oldestDate: number | null;
    newestDate: number | null;
  } {
    const convs = Array.from(this.conversations.values());

    return {
      total: convs.length,
      pinned: convs.filter(c => c.isPinned).length,
      totalMessages: convs.reduce((sum, c) => sum + c.messages.length, 0),
      oldestDate: convs.length > 0
        ? Math.min(...convs.map(c => c.createdAt))
        : null,
      newestDate: convs.length > 0
        ? Math.max(...convs.map(c => c.updatedAt))
        : null,
    };
  }
}
