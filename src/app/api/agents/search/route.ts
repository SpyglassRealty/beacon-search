import { NextRequest, NextResponse } from 'next/server';

const REPLIERS_API_KEY = process.env.REPLIERS_API_KEY || '';
const REPLIERS_BASE_URL = 'https://api.repliers.io';

// Rate limiting to respect 2.0 RPS limit
const RATE_LIMIT_DELAY = 700; // 700ms between calls = ~1.43 RPS

interface Agent {
  agentId: string;
  name: string;
  phones?: string[];
  email?: string | null;
  website?: string | null;
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

interface RepliersMember {
  name: string;
  agentId: string;
  email?: string;
  phones?: string[];
  brokerage?: {
    name?: string;
  };
}

interface RepliersListing {
  agents?: Array<{
    name: string;
    agentId: string;
    email?: string;
    phones?: string[];
    brokerage?: {
      name?: string;
    };
  }>;
}

interface RepliersStats {
  count?: number;
  statistics?: {
    soldPrice?: {
      sum?: number;
      avg?: number;
    };
    closed?: {
      yr?: Record<string, number>;
    };
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchMembers(query: string): Promise<RepliersMember[]> {
  await sleep(RATE_LIMIT_DELAY);
  
  // Note: Repliers /members endpoint doesn't filter by name server-side,
  // so we need to fetch results and filter client-side
  const response = await fetch(`${REPLIERS_BASE_URL}/members?resultsPerPage=500`, {
    headers: {
      'REPLIERS-API-KEY': REPLIERS_API_KEY,
    },
  });

  if (!response.ok) {
    console.error(`Members search failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const allMembers: RepliersMember[] = data.members || [];
  
  // Filter results client-side
  const queryLower = query.toLowerCase();
  const queryParts = queryLower.split(' ').filter(part => part.length > 0);
  
  return allMembers.filter(member => {
    if (!member.name) return false;
    const nameLower = member.name.toLowerCase();
    
    // Check if all query parts are found in the name
    return queryParts.every(part => nameLower.includes(part));
  });
}

async function searchByListings(query: string): Promise<RepliersMember[]> {
  await sleep(RATE_LIMIT_DELAY);
  
  // Build query for listing agent name search
  const queryParts = query.toLowerCase().split(' ').filter(part => part.length > 0);
  const searchQuery = `*${queryParts.join('*')}*`;
  
  const response = await fetch(`${REPLIERS_BASE_URL}/listings?raw.ListAgentFullName=${encodeURIComponent(searchQuery)}&resultsPerPage=100`, {
    headers: {
      'REPLIERS-API-KEY': REPLIERS_API_KEY,
    },
  });

  if (!response.ok) {
    console.error(`Listings search failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const listings: RepliersListing[] = data.listings || [];
  
  // Extract unique agents from listings
  const uniqueAgents = new Map<string, RepliersMember>();
  
  listings.forEach(listing => {
    const agents = listing.agents || [];
    agents.forEach(agent => {
      if (agent.name && agent.agentId) {
        // Check if agent name contains all query parts (case-insensitive)
        const agentNameLower = agent.name.toLowerCase();
        const matchesQuery = queryParts.every(part => 
          agentNameLower.includes(part.toLowerCase())
        );
        
        if (matchesQuery) {
          uniqueAgents.set(agent.agentId, {
            name: agent.name,
            agentId: agent.agentId,
            email: agent.email,
            phones: agent.phones,
            brokerage: agent.brokerage,
          });
        }
      }
    });
  });

  return Array.from(uniqueAgents.values());
}

async function getAgentStats(agentId: string): Promise<Partial<Agent>> {
  await sleep(RATE_LIMIT_DELAY);
  
  const statsParams = new URLSearchParams({
    agentId,
    status: 'U',
    lastStatus: 'Sld',
    'statistics': 'cnt-closed,sum-soldPrice,avg-soldPrice',
    resultsPerPage: '1',
  });

  const response = await fetch(`${REPLIERS_BASE_URL}/listings?${statsParams}`, {
    headers: {
      'REPLIERS-API-KEY': REPLIERS_API_KEY,
    },
  });

  if (!response.ok) {
    return {
      transactionsLast12Mo: 0,
      volumeLast12Mo: 0,
      totalTransactions: 0,
      totalVolume: 0,
      avgPrice: 0,
      yearsActive: 0,
      statsAvailable: false,
    };
  }

  const data: RepliersStats = await response.json();
  const count = data.count || 0;
  const stats = data.statistics || {};
  const soldPrice = stats.soldPrice || {};
  const closed = stats.closed || {};
  
  // Calculate years active from closed transactions
  let yearsActive = 0;
  if (closed.yr) {
    const years = Object.keys(closed.yr);
    if (years.length > 0) {
      const earliestYear = Math.min(...years.map(y => parseInt(y)));
      const latestYear = Math.max(...years.map(y => parseInt(y)));
      yearsActive = latestYear - earliestYear + 1;
    }
  }

  return {
    transactionsLast12Mo: count,
    volumeLast12Mo: Math.round(soldPrice.sum || 0),
    totalTransactions: count,
    totalVolume: Math.round(soldPrice.sum || 0),
    avgPrice: Math.round(soldPrice.avg || 0),
    yearsActive,
    statsAvailable: count > 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!REPLIERS_API_KEY) {
      return NextResponse.json(
        { error: 'REPLIERS_API_KEY not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query.trim()) {
      return NextResponse.json({
        agents: [],
        total: 0,
        page: 1,
        totalPages: 0,
        enrichedCount: 0,
        totalInCache: 0,
        availableBrokerages: [],
        source: 'repliers',
        query: query,
        message: 'No search query provided',
      });
    }

    console.log(`🔍 Searching for agents: "${query}"`);

    // Step 1: Search members directly
    const membersResults = await searchMembers(query);
    console.log(`📊 Direct members search found: ${membersResults.length} results`);

    // Step 2: Search by listings if direct search didn't find enough results
    let listingsResults: RepliersMember[] = [];
    if (membersResults.length < 5) {
      listingsResults = await searchByListings(query);
      console.log(`📊 Listings-based search found: ${listingsResults.length} additional results`);
    }

    // Combine and deduplicate results
    const allAgents = new Map<string, RepliersMember>();
    
    // Add members results first (higher priority)
    membersResults.forEach(agent => {
      allAgents.set(agent.agentId, agent);
    });
    
    // Add listings results if not already present
    listingsResults.forEach(agent => {
      if (!allAgents.has(agent.agentId)) {
        allAgents.set(agent.agentId, agent);
      }
    });

    const uniqueAgents = Array.from(allAgents.values());
    console.log(`📊 Total unique agents found: ${uniqueAgents.length}`);

    // Step 3: Enrich with stats (limited to first 10 to avoid rate limits)
    const agentsToEnrich = uniqueAgents.slice(0, 10);
    const enrichedAgents: Agent[] = [];

    for (const agent of agentsToEnrich) {
      const stats = await getAgentStats(agent.agentId);
      
      enrichedAgents.push({
        agentId: agent.agentId,
        name: agent.name,
        phones: agent.phones || [],
        email: agent.email,
        website: null,
        brokerage: agent.brokerage || {},
        transactionsLast12Mo: stats.transactionsLast12Mo || 0,
        volumeLast12Mo: stats.volumeLast12Mo || 0,
        totalTransactions: stats.totalTransactions || 0,
        totalVolume: stats.totalVolume || 0,
        avgPrice: stats.avgPrice || 0,
        yearsActive: stats.yearsActive || 0,
        statsAvailable: stats.statsAvailable || false,
      });
    }

    // Add remaining agents without full stats
    for (let i = 10; i < uniqueAgents.length; i++) {
      const agent = uniqueAgents[i];
      enrichedAgents.push({
        agentId: agent.agentId,
        name: agent.name,
        phones: agent.phones || [],
        email: agent.email,
        website: null,
        brokerage: agent.brokerage || {},
        transactionsLast12Mo: 0,
        volumeLast12Mo: 0,
        totalTransactions: 0,
        totalVolume: 0,
        avgPrice: 0,
        yearsActive: 0,
        statsAvailable: false,
      });
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedAgents = enrichedAgents.slice(startIndex, endIndex);

    // Extract unique brokerages
    const brokerages = new Set<string>();
    enrichedAgents.forEach(agent => {
      if (agent.brokerage?.name) {
        brokerages.add(agent.brokerage.name);
      }
    });

    const response = {
      agents: paginatedAgents,
      total: enrichedAgents.length,
      page,
      totalPages: Math.ceil(enrichedAgents.length / limit),
      enrichedCount: Math.min(enrichedAgents.length, 10),
      totalInCache: enrichedAgents.length,
      availableBrokerages: Array.from(brokerages).sort(),
      source: 'repliers',
      query,
      message: enrichedAgents.length === 0 
        ? 'No agents found matching your search'
        : `Found ${enrichedAgents.length} agent(s)`,
    };

    console.log(`✅ API Response: ${enrichedAgents.length} agents, ${paginatedAgents.length} on page ${page}`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Agent search API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to search agents',
        source: 'repliers'
      },
      { status: 500 }
    );
  }
}