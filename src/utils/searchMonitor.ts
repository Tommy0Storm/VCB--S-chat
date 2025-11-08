interface SearchMetrics {
  totalSearches: number;
  successfulSearches: number;
  failedSearches: number;
  averageResponseTime: number;
  lastError?: string;
  lastErrorTime?: number;
}

class SearchMonitor {
  private metrics: SearchMetrics = {
    totalSearches: 0,
    successfulSearches: 0,
    failedSearches: 0,
    averageResponseTime: 0
  };

  recordSearch(success: boolean, responseTime: number, error?: string): void {
    this.metrics.totalSearches++;
    
    if (success) {
      this.metrics.successfulSearches++;
    } else {
      this.metrics.failedSearches++;
      if (error) {
        this.metrics.lastError = error;
        this.metrics.lastErrorTime = Date.now();
      }
    }
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalSearches - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalSearches;
  }

  getMetrics(): SearchMetrics {
    return { ...this.metrics };
  }

  getSuccessRate(): number {
    return this.metrics.totalSearches > 0 
      ? this.metrics.successfulSearches / this.metrics.totalSearches 
      : 0;
  }

  reset(): void {
    this.metrics = {
      totalSearches: 0,
      successfulSearches: 0,
      failedSearches: 0,
      averageResponseTime: 0
    };
  }
}

export const searchMonitor = new SearchMonitor();