import { z } from 'zod';

// ─── get_supported_chains ────────────────────────────────────────────────

export const GetSupportedChainsInput = z.object({});

export const GetSupportedChainsOutput = z.object({
  chains: z.array(z.object({
    id:                 z.string().describe('Chain identifier used in all other tools'),
    name:               z.string(),
    chain_id:           z.number(),
    native_token:       z.string(),
    rpc_provider:       z.string(),
    bridges_supported:  z.array(z.string()),
    dexes_supported:    z.array(z.string()),
    indexed_since:      z.string().describe('ISO date from which historical data is available'),
  })),
  total_count: z.number(),
  fetched_at:  z.string(),
});

// ─── get_tracked_tokens ──────────────────────────────────────────────────

export const GetTrackedTokensInput = z.object({
  chain:  z.enum(['all', 'ethereum', 'arbitrum', 'base', 'optimism', 'bnb']).default('all'),
  limit:  z.number().min(1).max(500).default(100),
  offset: z.number().min(0).default(0),
});

export const GetTrackedTokensOutput = z.object({
  tokens: z.array(z.object({
    address:          z.string().describe('Token contract address — use this in stealth_accumulation and bridge_flow_anomalies'),
    symbol:           z.string(),
    name:             z.string(),
    chain:            z.string(),
    market_cap_usd:   z.number().nullable(),
    daily_volume_usd: z.number().nullable(),
    tracking_since:   z.string(),
  })),
  total_count: z.number(),
  fetched_at:  z.string(),
});

// ─── browse_by_chain ─────────────────────────────────────────────────────

export const BrowseByChainInput = z.object({
  chain: z.enum(['ethereum', 'arbitrum', 'base', 'optimism', 'bnb']).describe('Chain ID from get_supported_chains'),
  data_type: z
    .enum(['tokens', 'bridges', 'dexes', 'top_wallets'])
    .default('tokens')
    .describe('Category of data to list for this chain'),
  limit: z.number().min(1).max(100).default(50),
});

export const BrowseByChainOutput = z.object({
  chain:      z.string(),
  data_type:  z.string(),
  items: z.array(z.object({
    id:       z.string().describe('Primary identifier — use in analysis tools'),
    name:     z.string(),
    category: z.string(),
    metadata: z.record(z.string(), z.unknown()).describe('Additional type-specific fields'),
  })),
  total_count: z.number(),
  fetched_at:  z.string(),
});

export type GetSupportedChainsInputType = z.infer<typeof GetSupportedChainsInput>;
export type GetTrackedTokensInputType   = z.infer<typeof GetTrackedTokensInput>;
export type BrowseByChainInputType      = z.infer<typeof BrowseByChainInput>;
