import React from 'react';
import { NewsArticle } from '../utils/newsApi';

interface NewsHeadlinesProps {
  headlines: NewsArticle[];
  loading: boolean;
  error: string | null;
  onSearch: (query: string) => void;
  onRefresh: () => void;
}

export const NewsHeadlines: React.FC<NewsHeadlinesProps> = ({
  headlines,
  loading,
  error,
  onSearch,
  onRefresh
}) => {
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.elements[0] as HTMLInputElement;
    if (input.value.trim()) {
      onSearch(input.value.trim());
    }
  };

  return (
    <div className="fixed top-64 right-4 z-20 w-64 bg-white border-2 border-vcb-accent rounded-lg shadow-lg overflow-hidden">
      <div className="bg-vcb-black px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="material-icons text-vcb-accent text-xl">newspaper</span>
          <h3 className="text-white font-bold uppercase text-sm">Local News</h3>
        </div>
        <button
          onClick={onRefresh}
          className="text-vcb-accent hover:text-white transition-colors"
          title="Refresh news"
        >
          <span className="material-icons text-sm">refresh</span>
        </button>
      </div>
      
      <div className="p-4">
        {error ? (
          <div className="text-red-600 text-sm mb-4 p-2 bg-red-50 rounded">
            {error}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-icons text-vcb-mid-grey animate-spin">autorenew</span>
          </div>
        ) : headlines.length === 0 ? (
          <div className="text-center py-8 text-vcb-mid-grey">
            <span className="material-icons text-3xl mb-2">newspaper</span>
            <p className="text-sm">No news available</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {headlines.map((article, index) => (
              <div
                key={index}
                className="border border-vcb-light-grey rounded p-3 hover:border-vcb-accent hover:shadow-md transition-all cursor-pointer"
                onClick={() => window.open(article.url, '_blank')}
              >
                <h4 className="text-sm font-bold text-vcb-black line-clamp-2 mb-1">
                  {article.title}
                </h4>
                <p className="text-xs text-vcb-mid-grey line-clamp-2 mb-2">
                  {article.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-vcb-mid-grey">
                    {new Date(article.publishedAt).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-vcb-accent font-medium">
                    {article.source?.name || 'Unknown Source'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <form onSubmit={handleSearch} className="mt-4">
          <div className="flex">
            <input
              type="text"
              placeholder="Search news..."
              className="flex-1 px-3 py-1 text-xs border border-vcb-light-grey rounded-l focus:outline-none focus:border-vcb-accent"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-vcb-accent hover:bg-yellow-500 text-vcb-black px-3 py-1 text-xs font-bold rounded-r transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-icons text-xs">search</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};