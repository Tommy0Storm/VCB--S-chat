import Dexie from 'dexie';
import type { StoredDocument } from '../types/documents';

const DB_NAME = 'vcb-document-store';
const STORE_NAME = 'documents';

interface DocumentStoreSchema extends Dexie.Table<StoredDocument, string> {}

export class DocumentStore extends Dexie {
  documents: DocumentStoreSchema;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      [STORE_NAME]: '++id, name, type, size, text, uploadedAt, conversationId, embeddings'
    });
    this.documents = this.table(STORE_NAME);
  }

  async loadDocuments(): Promise<StoredDocument[]> {
    return this.documents.toArray();
  }

  async saveDocument(doc: StoredDocument): Promise<void> {
    await this.documents.put(doc);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.documents.delete(id);
  }

  async clearDocuments(): Promise<void> {
    await this.documents.clear();
  }

  async getDocumentsForConversation(conversationId: string): Promise<StoredDocument[]> {
    return this.documents.where('conversationId').equals(conversationId).toArray();
  }

  async addDocumentToConversation(conversationId: string, doc: StoredDocument): Promise<StoredDocument[]> {
    const updatedDoc = { ...doc, conversationId };
    await this.saveDocument(updatedDoc);
    return this.getDocumentsForConversation(conversationId);
  }

  async removeDocumentFromConversation(conversationId: string, id: string): Promise<StoredDocument[]> {
    await this.documents.delete(id);
    return this.getDocumentsForConversation(conversationId);
  }
}

export const documentStore = new DocumentStore();