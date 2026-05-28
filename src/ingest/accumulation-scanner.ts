/**
 * Accumulation Scanner — background cron job.
 *
 * Production schedule: every 30 minutes, queries Neo4j for new wallet clusters
 * exhibiting coordinated buy behaviour and writes scored results to Redis.
 * The stealth_accumulation tool reads from this Redis cache; it never triggers
 * a live Neo4j query on the hot path.
 */

import cron from 'node-cron';
import { setCache } from '../cache/helpers.js';
import { scoreAccumulationCluster, type WalletClusterRaw } from './analytics-engine.js';

// Production: these token addresses come from the tracked-token registry.
// For smoke testing, we use the same seed-based deterministic set.
const TRACKED_TOKENS = [
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chain: 'ethereum' },
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chain: 'ethereum' },
  { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chain: 'arbitrum' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chain: 'base' },
];

async function scanToken(token_address: string, chain: string, hours: number): Promise<void> {
  // Production: query Neo4j for wallet clusters active in the last `hours` window.
  // Here: deterministic mock for development/smoke testing.
  const seed = token_address.slice(2, 10);
  const base = parseInt(seed, 16) % 100;
  if (base < 30) return; // ~30% no signal

  const clusters: WalletClusterRaw[] = [{
    wallets: [
      `0x${seed}1111111111111111111111111111111111111111`.slice(0, 42),
      `0x${seed}2222222222222222222222222222222222222222`.slice(0, 42),
      `0x${seed}3333333333333333333333333333333333333333`.slice(0, 42),
    ],
    common_origin: `0x${seed}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 42),
    origin_label: base > 60 ? 'Coinbase Hot Wallet' : 'Binance Withdrawal Address',
    buys: Array.from({ length: Math.max(3, Math.floor(hours / 8)) }, (_, i) => ({
      wallet: `0x${seed}${i + 1}`.padEnd(42, '1').slice(0, 42),
      amount_usd: 25_000 + (base * 350) + (i * 1_000),
      pool: ['Uniswap V3', 'Curve', 'Balancer', '1inch'][i % 4]!,
      timestamp: new Date(Date.now() - (hours - i) * 3_600_000).toISOString(),
      price_impact_pct: 0.07 + (i * 0.015),
    })),
  }];

  for (const cluster of clusters) {
    const { score } = scoreAccumulationCluster(cluster);
    if (score < 0.3) continue;

    // Write watchlist entry for each wallet so bridge_flow_anomalies can cross-reference
    for (const wallet of cluster.wallets) {
      const watchlistKey = `watchlist:accum:${wallet.toLowerCase()}`;
      await setCache(watchlistKey, { token_address, chain, score, detected_at: new Date().toISOString() }, 7_200);
    }

    // Write batch result so stealth_accumulation tool reads from cache
    const cacheKey = `stealth:${chain}:${token_address.toLowerCase()}:${hours}`;
    await setCache(cacheKey, {
      timestamp: new Date().toISOString(),
      token_address,
      token_symbol: 'BATCH',
      chain,
      window_hours: hours,
      verdict: 'accumulation_detected',
      confidence: score,
      clusters: [cluster],
      total_volume_usd: cluster.buys.reduce((s, b) => s + b.amount_usd, 0),
      data_freshness: 'fresh',
      freshness_secs: 0,
    }, 1_800);
  }
}

export function startAccumulationScanner(): cron.ScheduledTask {
  console.log('[accumulation-scanner] Starting — 30-minute scan cycle');
  return cron.schedule('*/30 * * * *', async () => {
    console.log('[accumulation-scanner] Scan cycle started');
    for (const token of TRACKED_TOKENS) {
      for (const hours of [24, 48, 72]) {
        try {
          await scanToken(token.address, token.chain, hours);
        } catch (err) {
          console.error(`[accumulation-scanner] Error scanning ${token.address} (${hours}h):`, err);
        }
      }
    }
    console.log('[accumulation-scanner] Scan cycle complete');
  });
}
