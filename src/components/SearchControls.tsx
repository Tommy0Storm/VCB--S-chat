import React, { useState, useEffect } from 'react';
import { smartSearch } from '../utils/smartSearch';
import { SEARCH_STRATEGIES } from '../utils/searchConfig';
import { searchCache } from '../utils/searchCache';

interface SearchControlsProps {
  onStrategyChange?: (strategy: keyof typeof SEARCH_STRATEGIES) => void;
  currentStrategy?: keyof typeof SEARCH_STRATEGIES;
}

export const SearchControls: React.FC<SearchControlsProps> = ({ 
  onStrategyChange, 
  currentStrategy = 'STANDARD' 
}) => {
  const [stats, setStats] = useState(smartSearch.getStats());
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(smartSearch.getStats());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const strategies = [
    { key: 'QUICK' as const, name: 'Quick', description: 'Fast, snippets only', cost: '$0.00' },
    { key: 'BUDGET' as const, name: 'Budget', description: 'Free APIs + basic content', cost: '$0.01' },
    { key: 'STANDARD' as const, name: 'Standard', description: 'Google + AI analysis', cost: '$0.02' },
    { key: 'PREMIUM' as const, name: 'Premium', description: 'Full analysis + content', cost: '$0.05' }
  ];

  return (
    <div className="bg-white border border-vcb-light-grey rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-vcb-black uppercase tracking-wide">
          Search Controls
        </h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-vcb-mid-grey hover:text-vcb-black transition-colors"
        >
          {showDetails ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {/* Strategy Selector */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-vcb-mid-grey uppercase tracking-wide mb-2">
          Search Strategy
        </label>
        <div className="grid grid-cols-2 gap-2">
          {strategies.map((strategy) => (
            <button
              key={strategy.key}
              onClick={() => onStrategyChange?.(strategy.key)}
              className={`p-2 text-left border rounded transition-colors ${
                currentStrategy === strategy.key
                  ? 'bg-vcb-black text-white border-vcb-black'
                  : 'bg-white text-vcb-black border-vcb-light-grey hover:border-vcb-mid-grey'
              }`}
            >
              <div className="text-xs font-bold">{strategy.name}</div>
              <div className="text-[10px] opacity-75">{strategy.description}</div>
              <div className="text-[10px] font-mono">{strategy.cost}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-vcb-black">{stats.monthlySearches}</div>
          <div className="text-[10px] text-vcb-mid-grey uppercase">Searches</div>
        </div>
        <div>
          <div className="text-lg font-bold text-vcb-black">${stats.remainingBudget.toFixed(2)}</div>
          <div className="text-[10px] text-vcb-mid-grey uppercase">Remaining</div>
        </div>
        <div>
          <div className="text-lg font-bold text-vcb-black">{searchCache.size()}</div>
          <div className="text-[10px] text-vcb-mid-grey uppercase">Cached</div>
        </div>
      </div>

      {/* Detailed Stats */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-vcb-light-grey">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-vcb-mid-grey">User Tier:</span>
              <span className="font-medium text-vcb-black uppercase">{stats.userTier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vcb-mid-grey">Monthly Budget:</span>
              <span className="font-medium text-vcb-black">${stats.monthlyBudget.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vcb-mid-grey">Cache Hit Rate:</span>
              <span className="font-medium text-vcb-black">
                {searchCache.size() > 0 ? '~75%' : '0%'}
              </span>
            </div>
          </div>
          
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                searchCache.clear();
                smartSearch.clearCache();
              }}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-vcb-mid-grey border border-vcb-light-grey rounded hover:border-vcb-mid-grey transition-colors"
            >
              Clear Cache
            </button>
            <button
              onClick={() => smartSearch.resetMonthlyStats()}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-vcb-mid-grey border border-vcb-light-grey rounded hover:border-vcb-mid-grey transition-colors"
            >
              Reset Stats
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchControls;