import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  GetSupportedChainsInput,
  GetTrackedTokensInput,
  BrowseByChainInput,
} from '../schemas/discovery.js';
import { structuredError } from '../errors/codes.js';

// ─── Static chain registry ─────────────────────────────────────────────────

const CHAINS = [
  {
    id: 'ethereum',
    name: 'Ethereum Mainnet',
    chain_id: 1,
    native_token: 'ETH',
    rpc_provider: 'Alchemy WebSocket',
    bridges_supported: ['Stargate', 'Across', 'Hop Protocol'],
    dexes_supported: ['Uniswap V2', 'Uniswap V3', 'Curve', 'Balancer', '1inch'],
    indexed_since: '2020-01-01',
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum One',
    chain_id: 42161,
    native_token: 'ETH',
    rpc_provider: 'Alchemy WebSocket',
    bridges_supported: ['Stargate', 'Across', 'Hop Protocol'],
    dexes_supported: ['Uniswap V3', 'Curve', 'Balancer', '1inch', 'Camelot'],
    indexed_since: '2021-09-01',
  },
  {
    id: 'base',
    name: 'Base',
    chain_id: 8453,
    native_token: 'ETH',
    rpc_provider: 'Alchemy WebSocket',
    bridges_supported: ['Stargate', 'Across'],
    dexes_supported: ['Uniswap V3', 'Aerodrome', '1inch'],
    indexed_since: '2023-08-01',
  },
  {
    id: 'optimism',
    name: 'OP Mainnet',
    chain_id: 10,
    native_token: 'ETH',
    rpc_provider: 'Alchemy WebSocket',
    bridges_supported: ['Stargate', 'Across', 'Hop Protocol'],
    dexes_supported: ['Uniswap V3', 'Curve', 'Velodrome', '1inch'],
    indexed_since: '2021-07-01',
  },
  {
    id: 'bnb',
    name: 'BNB Smart Chain',
    chain_id: 56,
    native_token: 'BNB',
    rpc_provider: 'QuickNode WebSocket',
    bridges_supported: ['Stargate'],
    dexes_supported: ['PancakeSwap V3', 'Uniswap V3', '1inch'],
    indexed_since: '2021-01-01',
  },
];

// ─── Static token registry ─────────────────────────────────────────────────

const TOKEN_REGISTRY = [
  // Ethereum
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin',              chain: 'ethereum', market_cap_usd: 43_000_000_000,  daily_volume_usd: 8_200_000_000,  tracking_since: '2020-01-01' },
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD',            chain: 'ethereum', market_cap_usd: 111_000_000_000, daily_volume_usd: 62_000_000_000, tracking_since: '2020-01-01' },
  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether',         chain: 'ethereum', market_cap_usd: 38_000_000_000,  daily_volume_usd: 3_100_000_000,  tracking_since: '2020-01-01' },
  { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped Bitcoin',       chain: 'ethereum', market_cap_usd: 12_000_000_000,  daily_volume_usd: 890_000_000,    tracking_since: '2020-01-01' },
  { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI',  name: 'Uniswap',               chain: 'ethereum', market_cap_usd: 4_900_000_000,   daily_volume_usd: 112_000_000,    tracking_since: '2020-09-01' },
  { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', symbol: 'AAVE', name: 'Aave',                  chain: 'ethereum', market_cap_usd: 2_100_000_000,   daily_volume_usd: 78_000_000,     tracking_since: '2020-10-01' },
  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI',  name: 'Dai Stablecoin',        chain: 'ethereum', market_cap_usd: 5_500_000_000,   daily_volume_usd: 340_000_000,    tracking_since: '2020-01-01' },
  { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink',             chain: 'ethereum', market_cap_usd: 8_100_000_000,   daily_volume_usd: 245_000_000,    tracking_since: '2020-01-01' },
  // Arbitrum
  { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin (Arbitrum)',   chain: 'arbitrum', market_cap_usd: null, daily_volume_usd: 1_200_000_000, tracking_since: '2023-01-01' },
  { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether (Arb)',   chain: 'arbitrum', market_cap_usd: null, daily_volume_usd: 980_000_000,   tracking_since: '2021-09-01' },
  { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC.e', name: 'Bridged USDC (Arb)', chain: 'arbitrum', market_cap_usd: null, daily_volume_usd: 420_000_000,   tracking_since: '2021-09-01' },
  // Base
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin (Base)',       chain: 'base',     market_cap_usd: null, daily_volume_usd: 680_000_000,   tracking_since: '2023-08-01' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether (Base)',  chain: 'base',     market_cap_usd: null, daily_volume_usd: 310_000_000,   tracking_since: '2023-08-01' },
  // Optimism
  { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', name: 'USD Coin (Optimism)',  chain: 'optimism', market_cap_usd: null, daily_volume_usd: 520_000_000,   tracking_since: '2023-01-01' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether (OP)',   chain: 'optimism', market_cap_usd: null, daily_volume_usd: 215_000_000,   tracking_since: '2021-07-01' },
  // BNB
  { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin (BNB)',       chain: 'bnb',      market_cap_usd: null, daily_volume_usd: 390_000_000,   tracking_since: '2021-04-01' },
  { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD (BNB)',     chain: 'bnb',      market_cap_usd: null, daily_volume_usd: 2_100_000_000, tracking_since: '2021-01-01' },
];

// ─── Browse data factories ─────────────────────────────────────────────────

function getBrowseItems(chain: string, data_type: string, limit: number) {
  if (data_type === 'tokens') {
    return TOKEN_REGISTRY
      .filter((t) => t.chain === chain)
      .slice(0, limit)
      .map((t) => ({
        id: t.address,
        name: `${t.symbol} — ${t.name}`,
        category: 'token',
        metadata: {
          symbol: t.symbol,
          market_cap_usd: t.market_cap_usd,
          daily_volume_usd: t.daily_volume_usd,
          tracking_since: t.tracking_since,
        },
      }));
  }

  const chainInfo = CHAINS.find((c) => c.id === chain);
  if (!chainInfo) return [];

  if (data_type === 'bridges') {
    return chainInfo.bridges_supported.slice(0, limit).map((b) => ({
      id: b.toLowerCase().replace(/\s+/g, '-'),
      name: b,
      category: 'bridge',
      metadata: { supported_chains: CHAINS.filter((c) => c.bridges_supported.includes(b)).map((c) => c.id) },
    }));
  }

  if (data_type === 'dexes') {
    return chainInfo.dexes_supported.slice(0, limit).map((d) => ({
      id: d.toLowerCase().replace(/\s+/g, '-'),
      name: d,
      category: 'dex',
      metadata: { chains: CHAINS.filter((c) => c.dexes_supported.includes(d)).map((c) => c.id) },
    }));
  }

  // top_wallets — deterministic mock
  const seed = chain.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
    id: `0x${(seed * (i + 1)).toString(16).padStart(40, 'a')}`.slice(0, 42),
    name: i === 0 ? 'Coinbase Hot Wallet' : i === 1 ? 'Binance 14' : `Whale #${i + 1}`,
    category: i <= 1 ? 'cex' : 'whale',
    metadata: { volume_30d_usd: 50_000_000 - i * 4_000_000 },
  }));
}

// ─── Tool registration ─────────────────────────────────────────────────────

export function registerDiscoveryTools(server: McpServer): void {

  // ─── get_supported_chains ────────────────────────────────────────────────
  server.tool(
    'get_supported_chains',
    'List all blockchain networks supported by this MCP server. Returns chain IDs, bridge/DEX coverage, and historical data availability — the entry point for any agent that needs to discover which chains to query.',
    GetSupportedChainsInput.shape,
    async (args) => {
      try {
        GetSupportedChainsInput.parse(args);
        const result = {
          chains: CHAINS,
          total_count: CHAINS.length,
          fetched_at: new Date().toISOString(),
        };
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return structuredError('SCHEMA_VALIDATION_FAIL', `get_supported_chains failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ─── get_tracked_tokens ──────────────────────────────────────────────────
  server.tool(
    'get_tracked_tokens',
    'List all tokens tracked by the stealth accumulation and bridge anomaly detectors. Supports chain filtering and pagination. Use this to discover valid token_address values before calling stealth_accumulation or bridge_flow_anomalies.',
    GetTrackedTokensInput.shape,
    async (args) => {
      try {
        const parsed = GetTrackedTokensInput.parse(args);
        const filtered = parsed.chain === 'all'
          ? TOKEN_REGISTRY
          : TOKEN_REGISTRY.filter((t) => t.chain === parsed.chain);
        const page = filtered.slice(parsed.offset, parsed.offset + parsed.limit);
        const result = {
          tokens: page,
          total_count: filtered.length,
          fetched_at: new Date().toISOString(),
        };
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return structuredError('SCHEMA_VALIDATION_FAIL', `get_tracked_tokens failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // ─── browse_by_chain ─────────────────────────────────────────────────────
  server.tool(
    'browse_by_chain',
    'Browse tokens, bridges, DEXes, or top wallets for a specific chain. The universal starting point for chain-scoped research — prevents agents from missing assets by only knowing trending tokens.',
    BrowseByChainInput.shape,
    async (args) => {
      try {
        const parsed = BrowseByChainInput.parse(args);
        const items = getBrowseItems(parsed.chain, parsed.data_type, parsed.limit);
        const result = {
          chain: parsed.chain,
          data_type: parsed.data_type,
          items,
          total_count: items.length,
          fetched_at: new Date().toISOString(),
        };
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return structuredError('SCHEMA_VALIDATION_FAIL', `browse_by_chain failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
