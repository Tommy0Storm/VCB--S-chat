import { useState, useCallback } from 'react';
import { sanitizeUserInput, validateSearchQuery } from '../utils/security';

export const useSecureInput = (initialValue = '') => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const setSecureValue = useCallback((newValue: string) => {
    const sanitized = sanitizeUserInput(newValue);
    setValue(sanitized);
    setError(null);
  }, []);

  const validateAndSet = useCallback((newValue: string, isSearchQuery = false) => {
    if (isSearchQuery) {
      const validation = validateSearchQuery(newValue);
      if (!validation.isValid) {
        setError(validation.error || 'Invalid input');
        setValue(validation.sanitized);
        return false;
      }
      setValue(validation.sanitized);
      setError(null);
      return true;
    } else {
      const sanitized = sanitizeUserInput(newValue);
      setValue(sanitized);
      setError(null);
      return true;
    }
  }, []);

  const reset = useCallback(() => {
    setValue('');
    setError(null);
  }, []);

  return {
    value,
    error,
    setValue: setSecureValue,
    validateAndSet,
    reset,
    isValid: !error
  };
};