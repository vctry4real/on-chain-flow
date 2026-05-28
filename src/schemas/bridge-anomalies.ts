import { z } from 'zod';

export const BridgeFlowAnomaliesInput = z.object({
  token_address: z
    .string()
    .describe('ERC-20 token contract address to monitor (0x-prefixed)')
    .default('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  destination_chain: z
    .enum(['ethereum', 'arbitrum', 'base', 'optimism', 'bnb'])
    .default('ethereum')
    .describe('Chain receiving the bridged capital'),
  hours: z
    .number()
    .min(1)
    .max(168)
    .default(24)
    .describe('Look-back window in hours'),
  sigma_threshold: z
    .number()
    .min(1)
    .max(5)
    .default(2)
    .describe('Number of standard deviations above 30-day baseline required to flag anomaly'),
});

const BridgeInflow = z.object({
  source_chain:        z.string().describe('Chain the capital bridged from'),
  bridge_protocol:     z.string().describe('Bridge used (Stargate, Across, Hop Protocol, etc.)'),
  volume_usd:          z.number().describe('Total USD bridged in the window'),
  baseline_volume_usd: z.number().describe('30-day rolling average for this route'),
  z_score:             z.number().describe('Standard deviations above baseline'),
  receiving_wallets:   z
    .array(z.object({
      address:           z.string(),
      label:             z.string(),
      amount_usd:        z.number(),
      also_accumulating: z.boolean().describe('True if this wallet is ALSO in the stealth_accumulation watchlist for this token'),
    }))
    .describe('Individual wallets that received bridged funds'),
  tx_count:              z.number(),
  first_bridge_timestamp: z.string(),
  last_bridge_timestamp:  z.string(),
});

export const BridgeFlowAnomaliesOutput = z.object({
  timestamp:          z.string().describe('ISO 8601 timestamp of analysis'),
  token_address:      z.string(),
  token_symbol:       z.string(),
  destination_chain:  z.string(),
  window_hours:       z.number(),
  verdict: z
    .enum(['anomaly_detected', 'normal_activity', 'insufficient_history'])
    .describe('Primary finding'),
  anomaly_score: z
    .number()
    .min(0)
    .max(1)
    .describe('Composite anomaly strength (0 = normal, 1 = extreme deviation)'),
  correlated_accumulation: z
    .boolean()
    .describe('CRITICAL: True when bridge-receiving wallets also appear in the stealth accumulation watchlist — the highest-confidence alert state'),
  correlation_confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence in the bridge+accumulation correlation signal when correlated_accumulation is true'),
  inflows:                    z.array(BridgeInflow).describe('Per-route breakdown of anomalous bridge inflows'),
  total_anomalous_volume_usd: z.number().describe('Total bridged volume flagged as anomalous'),
  baseline_window_days:       z.number().default(30),
  narrative:                  z.string().describe('Plain-English analyst summary combining bridge and accumulation signals'),
  data_freshness:             z.enum(['fresh', 'stale']).default('fresh'),
  freshness_secs:             z.number(),
  data_sources:               z.array(z.string()),
});

export type BridgeFlowAnomaliesInputType  = z.infer<typeof BridgeFlowAnomaliesInput>;
export type BridgeFlowAnomaliesOutputType = z.infer<typeof BridgeFlowAnomaliesOutput>;
