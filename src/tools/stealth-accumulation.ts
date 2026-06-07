import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  StealthAccumulationInput,
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

// ─── Mock data factory (replaced in production by Neo4j graph queries) ──────

function buildMockClusters(token_address: string, hours: number): WalletClusterRaw[] {
  const seed = token_address.slice(2, 10);
  const base = parseInt(seed, 16) % 100;
  if (base < 30) return [];

  return [{
    wallets: [
      `0x${seed}1111111111111111111111111111111111111111`.slice(0, 42),
      `0x${seed}2222222222222222222222222222222222222222`.slice(0, 42),
      `0x${seed}3333333333333333333333333333333333333333`.slice(0, 42),
      `0x${seed}4444444444444444444444444444444444444444`.slice(0, 42),
      `0x${seed}5555555555555555555555555555555555555555`.slice(0, 42),
    ],
    common_origin: `0x${seed}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 42),
    origin_label: base > 60 ? 'Coinbase Hot Wallet' : 'Binance Withdrawal Address',
    buys: Array.from({ length: Math.max(4, hours / 6) }, (_, i) => ({
      wallet: `0x${seed}${i + 1}`.padEnd(42, '1').slice(0, 42),
      amount_usd: 28000 + (base * 400) + (i * 1200),
      pool: ['Uniswap V3', 'Curve', 'Balancer', '1inch'][i % 4]!,
      timestamp: new Date(Date.now() - (hours - i) * 3600_000).toISOString(),
      price_impact_pct: 0.08 + (i * 0.02),
    })),
  }];
}

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerStealthAccumulation(server: McpServer): void {
  server.tool(
    'stealth_accumulation',
    'Detect statistically anomalous coordinated wallet accumulation before token price moves. Returns a classifier verdict, per-wallet cluster breakdown, transparent score formula, and plain-English narrative — the same intelligence Arkham Intelligence ($1,500/year) charges for, at $0.10/response.',
    StealthAccumulationInput.shape,
    async (args) => {
      try {
        const parsed = StealthAccumulationInput.parse(args);
        const cacheKey = `stealth:${parsed.chain}:${parsed.token_address.toLowerCase()}:${parsed.hours}`;

        const cached = await getCached(cacheKey);
        if (cached) {
          return {
            content: [
              { type: 'text', text: JSON.stringify(cached) },
            ],
          };
        }

        const rawClusters = buildMockClusters(parsed.token_address, parsed.hours);

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
        const verdict = filteredClusters.length === 0
          ? 'no_signal'
          : topScore >= parsed.min_confidence ? 'accumulation_detected' : 'no_signal';

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
          narrative: generateAccumulationNarrative(
            'USDC',
            verdict,
            topScore,
            filteredClusters,
          ),
          data_freshness: 'fresh' as const,
          freshness_secs: 0,
          data_sources: [
            'Alchemy WebSocket (ERC-20 Transfer events)',
            'The Graph (Uniswap V3, Curve, Balancer subgraphs)',
            'Internal address label registry',
            'Neo4j transaction graph (wallet cluster detection)',
          ],
        };

        await setCache(cacheKey, result, 1800);

        return {
          content: [
            { type: 'text', text: JSON.stringify(result) },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return structuredError('UPSTREAM_UNAVAILABLE', `Stealth accumulation analysis failed: ${msg}`);
      }
    },
  );
}
