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
    // Check if IndexedDB is supported
    if (!window.indexedDB) {
      console.warn('[ContextStore] IndexedDB is not supported in this browser');
      throw new Error('IndexedDB is not supported in this browser');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        console.error('[ContextStore] IndexedDB initialization failed:', request.error);
        // Try to delete the database and recreate it
        const deleteRequest = indexedDB.deleteDatabase(this.dbName);
        deleteRequest.onsuccess = () => {
          console.log('[ContextStore] Database deleted successfully, retrying initialization');
          // Retry initialization
          this.init().then(resolve).catch(reject);
        };
        deleteRequest.onerror = () => {
          console.error('[ContextStore] Failed to delete database:', deleteRequest.error);
          reject(new Error(`IndexedDB initialization failed: ${request.error?.message || 'Unknown error'}`));
        };
      };
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[ContextStore] IndexedDB initialized successfully');
        // Add event listener for database close
        this.db.onclose = () => {
          console.warn('[ContextStore] Database connection closed');
          this.db = null;
        };
        // Add event listener for database error
        this.db.onerror = (event) => {
          console.error('[ContextStore] Database error:', event);
        };
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        try {
          const db = request.result;
          console.log('[ContextStore] Upgrading database from version', event.oldVersion, 'to', event.newVersion);
          if (!db.objectStoreNames.contains('contexts')) {
            console.log('[ContextStore] Creating contexts object store');
            const store = db.createObjectStore('contexts', { keyPath: 'id' });
            store.createIndex('type', 'type');
            store.createIndex('importance', 'importance');
            console.log('[ContextStore] Created contexts object store with indexes');
          }
        } catch (error) {
          console.error('[ContextStore] Database upgrade failed:', error);
          reject(new Error(`Database upgrade failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      };
      
      request.onblocked = () => {
        console.warn('[ContextStore] Database initialization blocked');
        reject(new Error('Database initialization blocked by another process'));
      };
    });
  }

  async storeContext(content: string, type: UserContext['type'], importance: number): Promise<void> {
    if (importance < 8) return; // Only store crucial context
    
    // If database is not initialized, try to initialize it
    if (!this.db) {
      try {
        await this.init();
      } catch (error) {
        console.warn('[ContextStore] Failed to initialize database for storing context:', error);
        return;
      }
    }
    
    if (!this.db) {
      console.warn('[ContextStore] Database not available for storing context');
      return;
    }
    
    try {
      const context: UserContext = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type,
        content: content.slice(0, 500), // Limit size
        importance,
        timestamp: Date.now()
      };

      const transaction = this.db.transaction(['contexts'], 'readwrite');
      const store = transaction.objectStore('contexts');
      
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error('[ContextStore] Transaction error:', event);
      };
      
      transaction.onabort = (event) => {
        console.warn('[ContextStore] Transaction aborted:', event);
      };
      
      await store.add(context);
      console.log('[ContextStore] Stored context:', context);
    } catch (error) {
      console.error('[ContextStore] Failed to store context:', error);
      // If the error is related to the database being closed, try to reinitialize
      if (error instanceof Error && (error.name === 'InvalidStateError' || error.message.includes('database'))) {
        console.log('[ContextStore] Database may be closed, attempting reinitialization');
        this.db = null;
        try {
          await this.init();
          console.log('[ContextStore] Reinitialization successful');
        } catch (reinitError) {
          console.error('[ContextStore] Reinitialization failed:', reinitError);
        }
      }
    }
  }

  async getCrucialContext(): Promise<string> {
    // If database is not initialized, try to initialize it
    if (!this.db) {
      try {
        await this.init();
      } catch (error) {
        console.warn('[ContextStore] Failed to initialize database for retrieving context:', error);
        return '';
      }
    }
    
    if (!this.db) {
      console.warn('[ContextStore] Database not available for retrieving context');
      return '';
    }
    
    try {
      const transaction = this.db.transaction(['contexts'], 'readonly');
      const store = transaction.objectStore('contexts');
      const index = store.index('importance');
      
      // Handle transaction errors
      transaction.onerror = (event) => {
        console.error('[ContextStore] Transaction error:', event);
      };
      
      transaction.onabort = (event) => {
        console.warn('[ContextStore] Transaction aborted:', event);
      };
      
      return new Promise((resolve) => {
        const contexts: UserContext[] = [];
        const request = index.openCursor(IDBKeyRange.lowerBound(8), 'prev');
        
        request.onsuccess = () => {
          try {
            const cursor = request.result;
            if (cursor && contexts.length < 5) { // Max 5 crucial contexts
              contexts.push(cursor.value);
              cursor.continue();
            } else {
              const contextString = contexts
                .map(c => `${c.type.toUpperCase()}: ${c.content}`)
                .join('\n');
              console.log('[ContextStore] Retrieved crucial context:', contextString);
              resolve(contextString);
            }
          } catch (error) {
            console.error('[ContextStore] Error processing cursor:', error);
            resolve('');
          }
        };
        
        request.onerror = () => {
          console.error('[ContextStore] Failed to retrieve context:', request.error);
          resolve('');
        };
      });
    } catch (error) {
      console.error('[ContextStore] Failed to retrieve crucial context:', error);
      // If the error is related to the database being closed, try to reinitialize
      if (error instanceof Error && (error.name === 'InvalidStateError' || error.message.includes('database'))) {
        console.log('[ContextStore] Database may be closed, attempting reinitialization');
        this.db = null;
        try {
          await this.init();
          console.log('[ContextStore] Reinitialization successful');
          // Try to get context again
          return await this.getCrucialContext();
        } catch (reinitError) {
          console.error('[ContextStore] Reinitialization failed:', reinitError);
          return '';
        }
      }
      return '';
    }
  }
}

export const contextStore = new ContextStore();