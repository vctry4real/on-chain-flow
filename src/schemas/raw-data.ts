import { z } from 'zod';

// ─── get_wallet_transfers ──────────────────────────────────────────────────

export const GetWalletTransfersInput = z.object({
  address: z.string().describe('Wallet address (0x-prefixed)').default('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
  chain:   z.enum(['ethereum', 'arbitrum', 'base', 'optimism', 'bnb']).default('ethereum'),
  limit:   z.number().min(1).max(200).default(50).describe('Number of transfers to return'),
  hours:   z.number().min(1).max(720).default(48).describe('Look-back window in hours'),
});

export const GetWalletTransfersOutput = z.object({
  address:  z.string(),
  chain:    z.string(),
  transfers: z.array(z.object({
    tx_hash:       z.string(),
    block_number:  z.number(),
    timestamp:     z.string(),
    from:          z.string(),
    to:            z.string(),
    token_address: z.string(),
    token_symbol:  z.string(),
    amount_raw:    z.string(),
    amount_usd:    z.number(),
    protocol:      z.string(),
    direction:     z.enum(['in', 'out']),
  })),
  total_count:    z.number(),
  data_freshness: z.enum(['fresh', 'stale']).default('fresh'),
  fetched_at:     z.string(),
});

// ─── get_token_swaps ──────────────────────────────────────────────────────

export const GetTokenSwapsInput = z.object({
  token_address: z.string().describe('Token contract address').default('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  chain:         z.enum(['ethereum', 'arbitrum', 'base', 'optimism', 'bnb']).default('ethereum'),
  hours:         z.number().min(1).max(168).default(24),
  dex:           z.enum(['all', 'uniswap_v2', 'uniswap_v3', 'curve', 'balancer', '1inch']).default('all'),
  limit:         z.number().min(1).max(500).default(100),
});

export const GetTokenSwapsOutput = z.object({
  token_address:        z.string(),
  token_symbol:         z.string(),
  chain:                z.string(),
  swaps: z.array(z.object({
    tx_hash:          z.string(),
    timestamp:        z.string(),
    trader:           z.string(),
    trader_label:     z.string(),
    dex:              z.string(),
    pool_address:     z.string(),
    side:             z.enum(['buy', 'sell']),
    amount_token:     z.number(),
    amount_usd:       z.number(),
    price_impact_pct: z.number(),
  })),
  total_buy_volume_usd:  z.number(),
  total_sell_volume_usd: z.number(),
  net_flow_usd:          z.number(),
  total_count:           z.number(),
  data_freshness:        z.enum(['fresh', 'stale']).default('fresh'),
  fetched_at:            z.string(),
});

// ─── get_bridge_events ────────────────────────────────────────────────────

export const GetBridgeEventsInput = z.object({
  token_address:     z.string().describe('Token to monitor').default('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  destination_chain: z.enum(['ethereum', 'arbitrum', 'base', 'optimism', 'bnb']).default('ethereum'),
  hours:             z.number().min(1).max(168).default(24),
  bridge:            z.enum(['all', 'stargate', 'across', 'hop']).default('all'),
  limit:             z.number().min(1).max(200).default(50),
});

export const GetBridgeEventsOutput = z.object({
  token_address:     z.string(),
  token_symbol:      z.string(),
  destination_chain: z.string(),
  events: z.array(z.object({
    tx_hash:      z.string(),
    timestamp:    z.string(),
    bridge:       z.string(),
    source_chain: z.string(),
    sender:       z.string(),
    recipient:    z.string(),
    amount_usd:   z.number(),
  })),
  total_volume_usd: z.number(),
  total_count:      z.number(),
  data_freshness:   z.enum(['fresh', 'stale']).default('fresh'),
  fetched_at:       z.string(),
});

// ─── get_address_labels ───────────────────────────────────────────────────

export const GetAddressLabelsInput = z.object({
  addresses: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe('Array of wallet addresses to label (max 50)')
    .default(['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']),
});

export const GetAddressLabelsOutput = z.object({
  labels: z.array(z.object({
    address:     z.string(),
    label:       z.string().describe('Human-readable entity name'),
    entity_type: z.enum(['cex', 'dex', 'bridge', 'fund', 'whale', 'mixer', 'unknown']),
    tags:        z.array(z.string()),
    risk_score:  z.number().min(0).max(1).describe('0 = clean, 1 = high risk'),
  })),
  total_labeled:  z.number(),
  total_unknown:  z.number(),
  data_freshness: z.enum(['fresh', 'stale']).default('fresh'),
  fetched_at:     z.string(),
});

export type GetWalletTransfersInputType = z.infer<typeof GetWalletTransfersInput>;
export type GetTokenSwapsInputType      = z.infer<typeof GetTokenSwapsInput>;
export type GetBridgeEventsInputType    = z.infer<typeof GetBridgeEventsInput>;
export type GetAddressLabelsInputType   = z.infer<typeof GetAddressLabelsInput>;
