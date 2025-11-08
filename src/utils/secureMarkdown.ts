import { sanitizeMarkdown } from './security';

// Enhanced markdown processing with security
export const processSecureMarkdown = (content: string): string => {
  if (!content) return '';
  
  // First sanitize the content
  const sanitized = sanitizeMarkdown(content);
  
  // Additional security measures for markdown
  return sanitized
    .replace(/javascript:/gi, '') // Remove javascript protocols
    .replace(/data:(?!image\/)/gi, '') // Only allow image data URLs
    .replace(/vbscript:/gi, '') // Remove vbscript
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
};