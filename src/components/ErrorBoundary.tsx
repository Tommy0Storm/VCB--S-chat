import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    
    // Log error securely (remove sensitive data)
    const sanitizedError = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'), // Limit stack trace
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.substring(0, 100) // Limit user agent
    };
    
    console.error('VCB-CHAT Error:', sanitizedError);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-red-50 border-2 border-red-200 rounded-lg">
          <span className="material-icons text-red-500 text-6xl mb-4">error_outline</span>
          <h2 className="text-xl font-bold text-red-700 mb-2">Something went wrong</h2>
          <p className="text-red-600 text-center mb-4">
            We encountered an unexpected error. Please refresh the page and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Search-specific error boundary
export const SearchErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center space-x-2 text-yellow-700">
          <span className="material-icons">warning</span>
          <span className="font-medium">Search temporarily unavailable</span>
        </div>
        <p className="text-yellow-600 text-sm mt-1">
          Please try your search again in a moment.
        </p>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

// Chat-specific error boundary
export const ChatErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center space-x-2 text-red-700">
          <span className="material-icons">error</span>
          <span className="font-medium">Chat error occurred</span>
        </div>
        <p className="text-red-600 text-sm mt-1">
          Your conversation is safe. Please refresh to continue.
        </p>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);