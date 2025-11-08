// Search Performance Statistics Component
import React from 'react';
import { enhancedSearch } from '../utils/enhancedSearch';

interface SearchStatsProps {
  isVisible: boolean;
  onClose: () => void;
}

export const SearchStats: React.FC<SearchStatsProps> = ({ isVisible, onClose }) => {
  if (!isVisible) return null;

  const stats = enhancedSearch.getCacheStats();

  return (
    <div className="fixed inset-0 bg-vcb-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-vcb-light-grey max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="bg-vcb-black border-b border-vcb-mid-grey px-4 py-3 flex items-center justify-between">
          <h3 className="text-vcb-white font-bold text-sm uppercase tracking-wide">Search Performance</h3>
          <button
            onClick={onClose}
            className="text-vcb-white hover:text-vcb-light-grey transition-colors"
            title="Close"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-vcb-black">{stats.size}</div>
              <div className="text-xs text-vcb-mid-grey uppercase">Cached Queries</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.hitRate}</div>
              <div className="text-xs text-vcb-mid-grey uppercase">Cache Hit Rate</div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xl font-bold text-vcb-black">{stats.avgResponseTime}</div>
            <div className="text-xs text-vcb-mid-grey uppercase">Avg Response Time</div>
          </div>
          
          <div className="border-t border-vcb-light-grey pt-3">
            <button
              onClick={() => {
                enhancedSearch.clearCache();
                onClose();
              }}
              className="w-full px-3 py-2 text-xs font-medium uppercase tracking-wide border border-vcb-mid-grey text-vcb-mid-grey hover:border-vcb-black hover:text-vcb-black transition-colors"
            >
              Clear Cache
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};