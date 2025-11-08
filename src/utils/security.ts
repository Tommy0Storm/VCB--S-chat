import DOMPurify from 'dompurify';

// Input sanitization for markdown content
export const sanitizeMarkdown = (content: string): string => {
  if (!content || typeof content !== 'string') return '';
  
  // Decode HTML entities first
  const decoded = content
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
  
  // Remove potential XSS vectors while preserving markdown
  const cleaned = DOMPurify.sanitize(decoded, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe']
  });
  
  return cleaned.trim();
};

// Search query validation
export const validateSearchQuery = (query: string): { isValid: boolean; error?: string; sanitized: string } => {
  if (!query || typeof query !== 'string') {
    return { isValid: false, error: 'Query is required', sanitized: '' };
  }
  
  const trimmed = query.trim();
  
  // Length validation
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Query too short (minimum 2 characters)', sanitized: trimmed };
  }
  
  if (trimmed.length > 500) {
    return { isValid: false, error: 'Query too long (maximum 500 characters)', sanitized: trimmed.substring(0, 500) };
  }
  
  // Remove dangerous patterns
  const sanitized = trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim();
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\b(eval|exec|system|shell_exec)\s*\(/i,
    /\b(document\.|window\.|location\.)/i,
    /\b(alert|confirm|prompt)\s*\(/i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      return { isValid: false, error: 'Query contains suspicious content', sanitized };
    }
  }
  
  return { isValid: true, sanitized };
};

// User input sanitization
export const sanitizeUserInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .substring(0, 10000); // Limit length but preserve spaces
};

// File upload validation
export const validateFileUpload = (file: File): { isValid: boolean; error?: string } => {
  const allowedTypes = ['text/plain', 'text/markdown', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'File type not allowed' };
  }
  
  if (file.size > maxSize) {
    return { isValid: false, error: 'File too large (max 10MB)' };
  }
  
  // Check file name for suspicious patterns
  const suspiciousExtensions = /\.(exe|bat|cmd|scr|pif|com|js|vbs|jar)$/i;
  if (suspiciousExtensions.test(file.name)) {
    return { isValid: false, error: 'File extension not allowed' };
  }
  
  return { isValid: true };
};

// API response sanitization
export const sanitizeApiResponse = (response: any): any => {
  if (typeof response === 'string') {
    return sanitizeMarkdown(response);
  }
  
  if (Array.isArray(response)) {
    return response.map(sanitizeApiResponse);
  }
  
  if (response && typeof response === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(response)) {
      sanitized[key] = sanitizeApiResponse(value);
    }
    return sanitized;
  }
  
  return response;
};