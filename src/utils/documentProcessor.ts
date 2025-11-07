import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import mammoth from 'mammoth';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_DOCUMENT_CHARACTERS = 200_000; // Prevent runaway storage usage

const normalizeWhitespace = (text: string): string => {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const truncateText = (text: string): string => {
  return text.length > MAX_DOCUMENT_CHARACTERS
    ? `${text.slice(0, MAX_DOCUMENT_CHARACTERS)}\n...[truncated]`
    : text;
};

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  let collected = '';

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (typeof (item as TextItem).str === 'string') {
            return (item as TextItem).str;
          }
          return '';
        })
        .join(' ');
      collected += `${pageText}\n`;
    }
  } finally {
    await pdf.destroy();
  }

  return truncateText(normalizeWhitespace(collected));
}

async function extractTextFromOfficeDocument(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return truncateText(normalizeWhitespace(value));
}

async function extractTextFromPlain(file: File): Promise<string> {
  const raw = await file.text();
  return truncateText(normalizeWhitespace(raw));
}

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = (file.name.split('.').pop() || '').toLowerCase();

  switch (extension) {
    case 'txt':
    case 'md':
      return extractTextFromPlain(file);
    case 'pdf':
      return extractTextFromPdf(file);
    case 'doc':
    case 'docx':
      return extractTextFromOfficeDocument(file);
    default:
      throw new Error('Unsupported file type');
  }
}
