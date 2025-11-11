export interface StoredDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  text: string;
  uploadedAt: number;
  conversationId?: string;
  embeddings?: number[][];
}
