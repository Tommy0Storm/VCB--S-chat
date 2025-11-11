declare module 'pdfjs-dist' {
  interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }
  
  interface PDFPageProxy {
    getTextContent(): Promise<{ items: { str?: string }[] }>;
  }
  
  interface GetDocumentParams {
    data: Uint8Array;
  }
  
  export function getDocument(params: GetDocumentParams): Promise<PDFDocumentProxy>;
  export const GlobalWorkerOptions: { workerSrc: string };
  export const version: string;
}