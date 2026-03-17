'use client';

import { useState } from 'react';

interface Agent {
  agentId: string;
  name: string;
  phones?: string[];
  email?: string | null;
  brokerage?: {
    name?: string;
  };
  transactionsLast12Mo?: number;
  volumeLast12Mo?: number;
  totalTransactions?: number;
  totalVolume?: number;
  avgPrice?: number;
  yearsActive?: number;
  statsAvailable?: boolean;
}

interface SearchResponse {
  agents: Agent[];
  total: number;
  page: number;
  totalPages: number;
  enrichedCount: number;
  totalInCache: number;
  availableBrokerages: string[];
  source: string;
  query: string;
  message: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/agents/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🔍 Beacon Agent Search
          </h1>
          <p className="text-lg text-gray-600">
            Search for real estate agents using the Repliers API
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for agents (e.g., 'Kaila Pucci')"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">❌ {error}</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Results Summary */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Search Results
                </h2>
                <div className="text-sm text-gray-500">
                  Source: <span className="font-medium">{results.source}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Query:</span>
                  <div className="font-medium">"{results.query}"</div>
                </div>
                <div>
                  <span className="text-gray-600">Total Found:</span>
                  <div className="font-medium">{results.total}</div>
                </div>
                <div>
                  <span className="text-gray-600">Enriched:</span>
                  <div className="font-medium">{results.enrichedCount}</div>
                </div>
                <div>
                  <span className="text-gray-600">Page:</span>
                  <div className="font-medium">{results.page} of {results.totalPages}</div>
                </div>
              </div>
              
              <p className="mt-4 text-gray-700">{results.message}</p>
            </div>

            {/* Agents List */}
            {results.agents.length > 0 && (
              <div className="space-y-4">
                {results.agents.map((agent) => (
                  <div key={agent.agentId} className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {agent.name}
                        </h3>
                        <p className="text-gray-600">ID: {agent.agentId}</p>
                      </div>
                      {agent.statsAvailable && (
                        <div className="text-right">
                          <div className="text-sm text-green-600 font-medium">
                            ✓ Stats Available
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Contact Info */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-2">Contact</h4>
                        <div className="space-y-1 text-sm">
                          {agent.email && (
                            <div>📧 {agent.email}</div>
                          )}
                          {agent.phones && agent.phones.length > 0 && (
                            <div>📞 {agent.phones.join(', ')}</div>
                          )}
                          {agent.brokerage?.name && (
                            <div>🏢 {agent.brokerage.name}</div>
                          )}
                        </div>
                      </div>

                      {/* Transaction Stats */}
                      {agent.statsAvailable && (
                        <>
                          <div>
                            <h4 className="text-sm font-medium text-gray-500 mb-2">Recent Activity</h4>
                            <div className="space-y-1 text-sm">
                              <div>Last 12 Months: {agent.transactionsLast12Mo} deals</div>
                              <div>Volume: {formatCurrency(agent.volumeLast12Mo || 0)}</div>
                            </div>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium text-gray-500 mb-2">Career Stats</h4>
                            <div className="space-y-1 text-sm">
                              <div>Total Deals: {agent.totalTransactions}</div>
                              <div>Total Volume: {formatCurrency(agent.totalVolume || 0)}</div>
                              <div>Avg Price: {formatCurrency(agent.avgPrice || 0)}</div>
                              <div>Years Active: {agent.yearsActive}</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No Results */}
            {results.agents.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No agents found matching your search.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}