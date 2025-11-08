interface UserContext {
  id: string;
  type: 'personal' | 'legal' | 'preference' | 'relationship';
  content: string;
  importance: number; // 1-10, only store 8+
  timestamp: number;
}

class ContextStore {
  private dbName = 'gogga-context';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('contexts')) {
          const store = db.createObjectStore('contexts', { keyPath: 'id' });
          store.createIndex('type', 'type');
          store.createIndex('importance', 'importance');
        }
      };
    });
  }

  async storeContext(content: string, type: UserContext['type'], importance: number): Promise<void> {
    if (importance < 8 || !this.db) return; // Only store crucial context
    
    const context: UserContext = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type,
      content: content.slice(0, 500), // Limit size
      importance,
      timestamp: Date.now()
    };

    const transaction = this.db.transaction(['contexts'], 'readwrite');
    const store = transaction.objectStore('contexts');
    await store.add(context);
  }

  async getCrucialContext(): Promise<string> {
    if (!this.db) return '';
    
    const transaction = this.db.transaction(['contexts'], 'readonly');
    const store = transaction.objectStore('contexts');
    const index = store.index('importance');
    
    return new Promise((resolve) => {
      const contexts: UserContext[] = [];
      const request = index.openCursor(IDBKeyRange.lowerBound(8), 'prev');
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && contexts.length < 5) { // Max 5 crucial contexts
          contexts.push(cursor.value);
          cursor.continue();
        } else {
          const contextString = contexts
            .map(c => `${c.type.toUpperCase()}: ${c.content}`)
            .join('\n');
          resolve(contextString);
        }
      };
      
      request.onerror = () => resolve('');
    });
  }
}

export const contextStore = new ContextStore();