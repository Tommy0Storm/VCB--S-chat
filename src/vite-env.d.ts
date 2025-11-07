/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CEREBRAS_API_KEY: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'pdfjs-dist/legacy/build/pdf.worker?url' {
  const workerSrc: string;
  export default workerSrc;
}

declare module 'pdfjs-dist/legacy/build/pdf' {
  interface PdfLoadingTask {
    promise: Promise<PdfDocument>;
  }

  interface PdfDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
    destroy(): Promise<void>;
  }

  interface PdfPage {
    getTextContent(): Promise<PdfTextContent>;
  }

  interface PdfTextContent {
    items: unknown[];
  }

  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(data: unknown): PdfLoadingTask;
}

declare module 'pdfjs-dist/types/src/display/api' {
  export interface TextItem {
    str: string;
  }
}

declare module 'mammoth' {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>;
}
