// Add ONNX.js dependency to package.json
// This will be handled by the build system
import type { StoredDocument } from '../types/documents';

const DOCUMENT_STORAGE_KEY = 'vcb-uploaded-documents';

const safeParse = (raw: string | null): StoredDocument[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StoredDocument[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.warn('[DocumentStore] Failed to parse stored documents:', error);
    return [];
  }
};

export const loadStoredDocuments = (): StoredDocument[] => {
  return safeParse(localStorage.getItem(DOCUMENT_STORAGE_KEY));
};

export const persistStoredDocuments = (documents: StoredDocument[]): void => {
  localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(documents));
};

export const removeStoredDocument = (id: string): StoredDocument[] => {
  const existing = loadStoredDocuments();
  const filtered = existing.filter((doc) => doc.id !== id);
  persistStoredDocuments(filtered);
  return filtered;
};
