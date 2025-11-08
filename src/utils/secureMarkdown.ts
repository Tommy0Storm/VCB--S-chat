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

// Secure ReactMarkdown components
export const secureMarkdownComponents = {
  // Sanitize all text content
  text: ({ children }: any) => {
    if (typeof children === 'string') {
      return sanitizeMarkdown(children);
    }
    return children;
  },
  
  // Secure links
  a: ({ href, children, ...props }: any) => {
    const secureHref = href?.startsWith('http') ? href : '#';
    return (
      <a 
        {...props} 
        href={secureHref} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-vcb-black underline hover:text-vcb-mid-grey transition-colors"
      >
        {children}
      </a>
    );
  },
  
  // Remove potentially dangerous elements
  script: () => null,
  iframe: () => null,
  object: () => null,
  embed: () => null,
  form: () => null,
  input: () => null,
};