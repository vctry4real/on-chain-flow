import { z } from 'zod';

const SUPPORTED_CHAINS = ['ethereum', 'arbitrum', 'base', 'optimism', 'bnb'] as const;

export const StealthAccumulationInput = z.object({
  token_address:  z.string().default('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48').describe('ERC-20 token contract address (0x-prefixed)'),
  chain:          z.enum(SUPPORTED_CHAINS).default('ethereum').describe('Target blockchain network'),
  hours:          z.number().min(1).max(168).default(24).describe('Lookback window in hours (1–168)'),
  min_confidence: z.number().min(0).max(1).default(0.6).describe('Minimum P(accumulation) to include a cluster (0–1)'),
});

// Transparent classifier score breakdown — every field is auditable
const ScoreBreakdown = z.object({
  // Raw feature scores (0–1 each)
  order_size_distribution: z.number().describe('CV of buy sizes — 0=uniform/bot-like, 1=natural human variance'),
  timing_variance:         z.number().describe('Inter-arrival gap CV — human coordination falls in 0.15–2.5 band'),
  pool_diversity:          z.number().describe('Fraction of 4 monitored DEXes used — 3+ pools = deliberate obfuscation'),
  price_impact_management: z.number().describe('Inverse avg price impact — disciplined accumulators stay <0.2%'),
  common_origin_strength:  z.number().describe('Redis funder-index confidence: fraction of cluster wallets sharing a first-hop funding source in the wallet graph'),
  // Logistic regression outputs
  weighted_score:       z.number().describe('Dot product of feature scores and calibrated weights ∈ (0,1)'),
  logistic_probability: z.number().describe('P(accumulation) after sigmoid activation + Platt calibration ∈ (0,1)'),
  // Trained weights for full auditability
  feature_weights: z.object({
    timing_variance:         z.number().describe('0.28 — strongest discriminator'),
    price_impact_management: z.number().describe('0.25 — second strongest'),
    pool_diversity:          z.number().describe('0.22'),
    order_size_distribution: z.number().describe('0.15'),
    common_origin_strength:  z.number().describe('0.10'),
  }),
});

export const StealthAccumulationOutput = z.object({
  timestamp:          z.string(),
  token_address:      z.string(),
  token_symbol:       z.string(),
  chain:              z.string(),
  window_hours:       z.number(),
  classifier_version: z.string().describe('Scoring formula version'),
  verdict:            z.enum(['accumulation_detected', 'no_signal', 'insufficient_data']),
  confidence:         z.number().describe('P(accumulation) for the top-scoring cluster — the classifier probability output'),
  score_breakdown:    ScoreBreakdown,
  clusters: z.array(z.object({
    wallets:                  z.array(z.string()),
    common_origin:            z.string(),
    origin_label:             z.string(),
    collective_position_usd:  z.number(),
    median_order_size_usd:    z.number(),
    pools_used:               z.array(z.string()),
    timing_variance_minutes:  z.number(),
    activity_consistent_with: z.enum(['human_coordinated', 'bot_automated', 'ambiguous']),
    first_buy_timestamp:      z.string(),
    last_buy_timestamp:       z.string(),
  })),
  total_volume_usd:  z.number(),
  narrative:         z.string(),
  data_freshness:    z.enum(['fresh', 'cached', 'stale']),
  freshness_secs:    z.number(),
  data_sources:      z.array(z.string()),
});

export type StealthAccumulationInputType  = z.infer<typeof StealthAccumulationInput>;
export type StealthAccumulationOutputType = z.infer<typeof StealthAccumulationOutput>;
