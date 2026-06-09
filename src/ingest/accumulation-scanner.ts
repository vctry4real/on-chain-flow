/**
 * Accumulation Scanner — background cron job.
 *
 * Runs every 30 minutes. Reads live ERC-20 transfer events from Redis (populated
 * by QuickNode Streams), clusters wallets by shared 1-hop funding source, scores
 * each cluster with the logistic regression classifier, and writes results to Redis.
 * The stealth_accumulation tool reads from this cache on the hot path.
 */

import cron from 'node-cron';
import { setCache } from '../cache/helpers.js';
import { scoreAccumulationCluster, type WalletClusterRaw } from './analytics-engine.js';
import { getTransferEvents, getFundingSource } from './event-processor.js';

// Production: these token addresses come from the tracked-token registry.
// For smoke testing, we use the same seed-based deterministic set.
const TRACKED_TOKENS = [
  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chain: 'ethereum' },
  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chain: 'ethereum' },
  { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chain: 'arbitrum' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chain: 'base' },
];

async function buildClustersFromStream(token_address: string, chain: string, hours: number): Promise<WalletClusterRaw[]> {
  const events = await getTransferEvents(chain, token_address, hours);
  if (events.length < 3) return [];

  // Group by recipient wallet
  const walletMap = new Map<string, typeof events>();
  for (const ev of events) {
    const list = walletMap.get(ev.to) ?? [];
    list.push(ev);
    walletMap.set(ev.to, list);
  }

  // Keep wallets with multiple buys or a single large buy
  const active = [...walletMap.entries()].filter(
    ([, evs]) => evs.length >= 2 || (evs[0]?.amount_usd ?? 0) >= 50_000,
  );
  if (active.length < 2) return [];

  // Real common-origin detection: look up each wallet's 1-hop funding source from Redis
  const funderMap = new Map<string, string[]>();
  await Promise.all(
    active.map(async ([addr]) => {
      const funder = (await getFundingSource(chain, addr)) ?? 'unknown';
      const group  = funderMap.get(funder) ?? [];
      group.push(addr);
      funderMap.set(funder, group);
    }),
  );

  const clusters: WalletClusterRaw[] = [];

  for (const [funder, wallets] of funderMap.entries()) {
    // Skip isolated unknown-origin wallets — no clustering signal
    if (wallets.length < 2 && funder === 'unknown') continue;

    const buys = wallets.flatMap((addr) =>
      (walletMap.get(addr) ?? []).map((ev) => ({
        wallet:           ev.to,
        amount_usd:       ev.amount_usd,
        pool:             ev.pool !== 'Direct' ? ev.pool : 'Uniswap V3',
        timestamp:        ev.timestamp,
        price_impact_pct: ev.price_impact_pct > 0 ? ev.price_impact_pct : 0.10,
      })),
    );

    if (buys.length < 2) continue;

    clusters.push({
      wallets,
      common_origin: funder,
      origin_label:  funder === 'unknown'
        ? 'Unknown'
        : `Funding wallet ${funder.slice(0, 8)}…`,
      buys,
    });
  }

  return clusters;
}

async function scanToken(token_address: string, chain: string, hours: number): Promise<void> {
  const clusters = await buildClustersFromStream(token_address, chain, hours);

  // No live data yet — streams may still be warming up. Do not write to cache;
  // the stealth_accumulation tool will return verdict: insufficient_data.
  if (clusters.length === 0) return;

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
