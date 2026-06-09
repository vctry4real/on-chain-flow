import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  StealthAccumulationInput,
  StealthAccumulationOutput,
} from '../schemas/stealth-accumulation.js';
import { getCached, setCache } from '../cache/helpers.js';
import { structuredError } from '../errors/codes.js';
import {
  scoreAccumulationCluster,
  generateAccumulationNarrative,
  CLASSIFIER_VERSION,
  type WalletClusterRaw,
} from '../ingest/analytics-engine.js';
import { resolveTokenSymbol } from '../ingest/event-processor.js';

// _meta — Context Protocol platform metadata (pricing, rate-limits, audit fields)
// Ref: https://docs.ctxprotocol.com/guides/tool-metadata
export const STEALTH_ACCUMULATION_META = {
  surface: 'both' as const,
  queryEligible: true,
  latencyClass: 'instant' as const,
  pricing: { executeUsd: '0.001' },
  rateLimit: { maxRequestsPerMinute: 120, cooldownMs: 500, maxConcurrency: 30 },
  dataBroker: { deterministic: true, auditFields: ['confidence', 'verdict', 'score_breakdown', 'data_freshness'] },
};

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerStealthAccumulation(server: McpServer): void {
  server.registerTool(
    'stealth_accumulation',
    {
      description: 'Detect statistically anomalous coordinated wallet accumulation before token price moves. Returns a classifier verdict, per-wallet cluster breakdown, transparent score formula, and plain-English narrative — replacing Arkham Intelligence ($1,500/year) at $0.001/call.',
      inputSchema:  StealthAccumulationInput.shape,
      outputSchema: StealthAccumulationOutput.shape,
    },
    async (args) => {
      try {
        const parsed = StealthAccumulationInput.parse(args);
        const cacheKey = `stealth:${parsed.chain}:${parsed.token_address.toLowerCase()}:${parsed.hours}`;

        const cached = await getCached(cacheKey);
        if (cached) {
          return {
            content: [{ type: 'text', text: JSON.stringify(cached) }],
            structuredContent: cached as Record<string, unknown>,
          };
        }

        // No cache hit — accumulation scanner hasn't populated this token/window yet.
        // Return insufficient_data so the caller knows to retry after streams warm up.
        const rawClusters: WalletClusterRaw[] = [];

        const scoredClusters = rawClusters.map((cluster) => {
          const { score, breakdown, activity_consistent_with } = scoreAccumulationCluster(cluster);
          const amounts = cluster.buys.map((b) => b.amount_usd);
          const median_order_size_usd = amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)] ?? 0;
          return {
            wallets: cluster.wallets,
            common_origin: cluster.common_origin,
            origin_label: cluster.origin_label,
            collective_position_usd: cluster.buys.reduce((s, b) => s + b.amount_usd, 0),
            median_order_size_usd,
            pools_used: [...new Set(cluster.buys.map((b) => b.pool))],
            timing_variance_minutes: (breakdown.timing_variance * 8).toFixed(1) as unknown as number,
            activity_consistent_with,
            first_buy_timestamp: cluster.buys[0]?.timestamp ?? new Date().toISOString(),
            last_buy_timestamp: cluster.buys[cluster.buys.length - 1]?.timestamp ?? new Date().toISOString(),
            _score: score,
            _breakdown: breakdown,
          };
        });

        const filteredClusters = scoredClusters.filter((c) => c._score >= parsed.min_confidence);

        const topScore = filteredClusters[0]?._score ?? 0;
        const verdict = rawClusters.length === 0
          ? 'insufficient_data'
          : filteredClusters.length === 0 || topScore < parsed.min_confidence
            ? 'no_signal'
            : 'accumulation_detected';

        const emptyBreakdown = {
          order_size_distribution: 0, timing_variance: 0, pool_diversity: 0,
          price_impact_management: 0, common_origin_strength: 0,
          weighted_score: 0, logistic_probability: 0,
          feature_weights: { timing_variance: 0.28, price_impact_management: 0.25, pool_diversity: 0.22, order_size_distribution: 0.15, common_origin_strength: 0.10 },
        };

        const result = {
          timestamp:          new Date().toISOString(),
          token_address:      parsed.token_address,
          token_symbol:       resolveTokenSymbol(parsed.token_address),
          chain:              parsed.chain,
          window_hours:       parsed.hours,
          classifier_version: CLASSIFIER_VERSION,
          verdict,
          confidence:         topScore,
          score_breakdown:    filteredClusters[0]?._breakdown ?? emptyBreakdown,
          clusters: filteredClusters.map(({ _score: _, _breakdown: __, ...c }) => c),
          total_volume_usd: filteredClusters.reduce((s, c) => s + c.collective_position_usd, 0),
          narrative: verdict === 'insufficient_data'
            ? 'Insufficient stream data for this token and window. QuickNode Streams are still indexing — retry in 30 minutes once the accumulation scanner has completed its first cycle.'
            : generateAccumulationNarrative(
                resolveTokenSymbol(parsed.token_address),
                verdict,
                topScore,
                filteredClusters,
              ),
          data_freshness: 'fresh' as const,
          freshness_secs: 0,
          data_sources: [
            'QuickNode Streams (real-time ERC-20 Transfer events, 5 chains)',
            'Redis wallet graph (1-hop funder index for common-origin clustering)',
            'Internal address label registry',
          ],
        };

        await setCache(cacheKey, result, 1800);

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return structuredError('UPSTREAM_UNAVAILABLE', `Stealth accumulation analysis failed: ${msg}`);
      }
    },
  );
}
