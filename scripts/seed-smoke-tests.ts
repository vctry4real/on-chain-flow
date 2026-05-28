/**
 * Smoke-test seed script — pre-populates Redis with deterministic fixture data
 * so grant validators can verify all tool responses without live blockchain data.
 *
 * Usage: npm run seed
 *
 * After seeding, every tool call with the addresses below returns a cache hit
 * with predictable values that can be compared against expected output.
 */

import 'dotenv/config';
import { connectRedis, redis } from '../src/cache/client.js';
import { setCache } from '../src/cache/helpers.js';

// ─── Fixture addresses ──────────────────────────────────────────────────────

const USDC_ETHEREUM   = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ARBITRUM   = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const VITALIK         = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const COINBASE_HOT    = '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43';

// ─── Seed helpers ───────────────────────────────────────────────────────────

async function seedStealthAccumulation(): Promise<void> {
  const result = {
    timestamp: new Date().toISOString(),
    token_address: USDC_ETHEREUM,
    token_symbol: 'USDC',
    chain: 'ethereum',
    window_hours: 24,
    verdict: 'accumulation_detected',
    confidence: 0.82,
    score_breakdown: {
      order_size_distribution: 0.73,
      timing_variance: 0.85,
      pool_diversity: 0.75,
      price_impact_management: 0.91,
      common_origin_strength: 0.90,
    },
    clusters: [{
      wallets: [
        '0xa0b8111111111111111111111111111111111111',
        '0xa0b8222222222222222222222222222222222222',
        '0xa0b8333333333333333333333333333333333333',
        '0xa0b8444444444444444444444444444444444444',
        '0xa0b8555555555555555555555555555555555555',
      ],
      common_origin: COINBASE_HOT,
      origin_label: 'Coinbase Hot Wallet',
      collective_position_usd: 1_430_000,
      median_order_size_usd: 28_400,
      pools_used: ['Uniswap V3', 'Curve', 'Balancer', '1inch'],
      timing_variance_minutes: 6.8,
      activity_consistent_with: 'human_coordinated',
      first_buy_timestamp: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      last_buy_timestamp:  new Date(Date.now() -  2 * 3_600_000).toISOString(),
    }],
    total_volume_usd: 1_430_000,
    narrative: 'Confidence: 82%. 5 wallets sharing a common Coinbase Hot Wallet origin have collectively accumulated $1.43M in USDC using a median order size of $28,400 across 4 liquidity pools (Uniswap V3, Curve, Balancer). Timing variance of 6.8 min between orders is inconsistent with bot activity and consistent with human-coordinated accumulation. No additional clusters detected.',
    data_freshness: 'fresh',
    freshness_secs: 0,
    data_sources: [
      'Alchemy WebSocket (ERC-20 Transfer events)',
      'The Graph (Uniswap V3, Curve, Balancer subgraphs)',
      'Internal address label registry',
      'Neo4j transaction graph (wallet cluster detection)',
    ],
  };

  await setCache(`stealth:ethereum:${USDC_ETHEREUM.toLowerCase()}:24`, result, 7_200);
  console.log('[seed] stealth_accumulation (USDC/ethereum/24h) ✓');
}

async function seedBridgeAnomalies(): Promise<void> {
  const result = {
    timestamp: new Date().toISOString(),
    token_address: USDC_ARBITRUM,
    token_symbol: 'USDC',
    destination_chain: 'arbitrum',
    window_hours: 24,
    verdict: 'anomaly_detected',
    anomaly_score: 0.925,
    correlated_accumulation: true,
    correlation_confidence: 0.88,
    inflows: [{
      source_chain: 'ethereum',
      bridge_protocol: 'Stargate',
      volume_usd: 5_200_000,
      baseline_volume_usd: 310_000,
      z_score: 24.80,
      receiving_wallets: [
        { address: '0xaf88111111111111111111111111111111111111', label: 'Unknown Wallet', amount_usd: 2_900_000, also_accumulating: true },
        { address: '0xaf88222222222222222222222222222222222222', label: 'Unknown Wallet', amount_usd: 2_300_000, also_accumulating: true },
      ],
      tx_count: 28,
      first_bridge_timestamp: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      last_bridge_timestamp:  new Date(Date.now() -  1 * 3_600_000).toISOString(),
    }],
    total_anomalous_volume_usd: 5_200_000,
    baseline_window_days: 30,
    narrative: '$5.20M in USDC has bridged in from 1 route at volumes significantly above the 30-day baseline. CORRELATED ALERT: Receiving wallets are simultaneously appearing in the stealth accumulation watchlist for this token. This dual-signal pattern — bridge inflows + fragmented DEX accumulation — represents the highest-confidence pre-move indicator available.',
    data_freshness: 'fresh',
    freshness_secs: 0,
    data_sources: [
      'Stargate Finance: bridge contract events (Ethereum, Arbitrum, Base, Optimism, BNB)',
      'Across Protocol: bridge contract events',
      'Hop Protocol: bridge contract events',
      'Internal 30-day z-score baseline (Redis streaming aggregation)',
      'Stealth accumulation watchlist (Redis cross-reference)',
    ],
  };

  await setCache(`bridge:arbitrum:${USDC_ARBITRUM.toLowerCase()}:24`, result, 7_200);
  console.log('[seed] bridge_flow_anomalies (USDC/arbitrum/24h) ✓');
}

async function seedCapitalFlow(): Promise<void> {
  const result = {
    timestamp: new Date().toISOString(),
    subject_address: VITALIK,
    subject_label: 'Vitalik Buterin',
    hops_traced: 4,
    origin_address: COINBASE_HOT,
    origin_label: 'Coinbase Hot Wallet',
    origin_chain: 'ethereum',
    provenance_chain: [
      { hop_number: 1, from_address: COINBASE_HOT, to_address: '0xabc1000000000000000000000000000000000001', from_label: 'Coinbase Hot Wallet', to_label: 'Unknown Wallet', amount_usd: 150_000, token_symbol: 'USDC', chain: 'ethereum', protocol: 'Ethereum transfer', timestamp: new Date(Date.now() - 4 * 86_400_000).toISOString(), tx_hash: '0xseed000000000000000000000000000000000000000000000000000000000001', obfuscation_flag: 'none' },
      { hop_number: 2, from_address: '0xabc1000000000000000000000000000000000001', to_address: '0xabc2000000000000000000000000000000000002', from_label: 'Unknown Wallet', to_label: 'Unknown Wallet', amount_usd: 130_000, token_symbol: 'ETH', chain: 'ethereum', protocol: 'Uniswap V3 swap', timestamp: new Date(Date.now() - 3 * 86_400_000).toISOString(), tx_hash: '0xseed000000000000000000000000000000000000000000000000000000000002', obfuscation_flag: 'none' },
      { hop_number: 3, from_address: '0xabc2000000000000000000000000000000000002', to_address: '0xabc3000000000000000000000000000000000003', from_label: 'Unknown Wallet', to_label: 'Unknown Wallet', amount_usd: 110_000, token_symbol: 'WBTC', chain: 'arbitrum', protocol: 'Stargate bridge', timestamp: new Date(Date.now() - 2 * 86_400_000).toISOString(), tx_hash: '0xseed000000000000000000000000000000000000000000000000000000000003', obfuscation_flag: 'bridge_hop' },
      { hop_number: 4, from_address: '0xabc3000000000000000000000000000000000003', to_address: VITALIK, from_label: 'Unknown Wallet', to_label: 'Vitalik Buterin', amount_usd: 90_000, token_symbol: 'USDC', chain: 'ethereum', protocol: 'Ethereum transfer', timestamp: new Date(Date.now() - 1 * 86_400_000).toISOString(), tx_hash: '0xseed000000000000000000000000000000000000000000000000000000000004', obfuscation_flag: 'none' },
    ],
    obfuscation_techniques_detected: [],
    risk_flags: [],
    narrative: 'Capital tracing for 0xd8da6b…: Origin identified as Coinbase Hot Wallet (ethereum). Funds moved through 4 hops over approximately 4 days. 1 cross-chain bridge hop detected (Stargate bridge). No significant risk flags detected.',
    confidence: 0.92,
    path_completeness: 'full',
    data_freshness: 'fresh',
    freshness_secs: 0,
    data_sources: [
      'Alchemy WebSocket (ERC-20 Transfer events, ETH transfers)',
      'The Graph (Uniswap V3, Stargate, Hop Protocol subgraphs)',
      'Internal address label registry (CEX hot wallets, bridge contracts, known funds)',
      'Neo4j transaction graph (6-hop provenance traversal)',
    ],
  };

  await setCache(`provenance:${VITALIK.toLowerCase()}:6:true`, result, 7_200);
  console.log('[seed] trace_capital_flow (Vitalik/6hops/bridges) ✓');
}

async function seedWalletTransfers(): Promise<void> {
  const transfers = Array.from({ length: 10 }, (_, i) => ({
    tx_hash:       `0xseedtransfer${i.toString().padStart(50, '0')}`.slice(0, 66),
    block_number:  19_000_000 + i,
    timestamp:     new Date(Date.now() - (24 - i) * 3_600_000).toISOString(),
    from:          i % 2 === 0 ? COINBASE_HOT : VITALIK,
    to:            i % 2 === 0 ? VITALIK : COINBASE_HOT,
    token_address: USDC_ETHEREUM,
    token_symbol:  'USDC',
    amount_raw:    `${12_000_000 + i * 1_000_000}`,
    amount_usd:    12_000 + i * 1_000,
    protocol:      i % 3 === 0 ? 'Uniswap V3' : 'Ethereum transfer',
    direction:     (i % 2 === 0 ? 'out' : 'in') as 'in' | 'out',
  }));

  const result = {
    address: VITALIK,
    chain: 'ethereum',
    transfers,
    total_count: transfers.length,
    data_freshness: 'fresh',
    fetched_at: new Date().toISOString(),
  };

  await setCache(`transfers:ethereum:${VITALIK.toLowerCase()}:24`, result, 7_200);
  console.log('[seed] get_wallet_transfers (Vitalik/ethereum/24h) ✓');
}

async function seedAddressLabels(): Promise<void> {
  console.log('[seed] get_address_labels — stateless (no cache needed) ✓');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[seed] Connecting to Redis…');
  await connectRedis();

  console.log('[seed] Seeding smoke-test fixtures…');
  await seedStealthAccumulation();
  await seedBridgeAnomalies();
  await seedCapitalFlow();
  await seedWalletTransfers();
  await seedAddressLabels();

  // Verify a key was written
  const check = await redis.get(`stealth:ethereum:${USDC_ETHEREUM.toLowerCase()}:24`);
  if (!check) throw new Error('Redis write verification failed — seed aborted');

  console.log('\n[seed] All fixtures written. Smoke tests ready.');
  console.log('[seed] Test addresses:');
  console.log(`  USDC (ethereum): ${USDC_ETHEREUM}`);
  console.log(`  USDC (arbitrum): ${USDC_ARBITRUM}`);
  console.log(`  Vitalik:         ${VITALIK}`);
  console.log(`  Coinbase Hot:    ${COINBASE_HOT}`);

  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
