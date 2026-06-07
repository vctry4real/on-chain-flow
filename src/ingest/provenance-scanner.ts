/**
 * Provenance Scanner — nightly cron job.
 *
 * Runs at 02:00 UTC daily. Reads the top active wallets from Redis (populated
 * by the event processor), runs a backward transfer traversal for each, and
 * stores the result under `provenance:precomputed:{chain}:{address}` with a
 * 26-hour TTL. The trace_capital_flow tool checks this key first — returning
 * sub-second responses for pre-computed wallets before falling back to live
 * traversal.
 *
 * Mirrors the proposal's "top 25,000 wallets pre-computed nightly" design.
 * In practice the active set size is bounded by stream volume; the scanner
 * processes up to MAX_WALLETS_PER_CHAIN regardless.
 */

import cron from 'node-cron';
import { redis } from '../cache/client.js';
import { getWalletTransfers, resolveTokenSymbol } from './event-processor.js';

const MAX_WALLETS_PER_CHAIN = 1_000;
const PRECOMPUTED_TTL       = 26 * 3600;  // 26h — survives the 24h cron gap
const CHAINS                = ['ethereum', 'arbitrum', 'base', 'optimism', 'bnb'] as const;

const ENTITY_LABELS: Record<string, string> = {
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': 'Vitalik Buterin',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase Hot Wallet',
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': 'Binance 14',
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance Hot Wallet 20',
  '0x5a58505a96d1dbf8df91cb21b54419fc36e93fde': 'Stargate: Router',
  '0x3a23f943181408eac424116af7b7790c94cb97a5': 'Across Protocol Bridge',
  '0xb8901acb165ed027e32754e0ffe830802919727f': 'Hop Protocol Bridge',
};

function resolveLabel(address: string): string {
  return ENTITY_LABELS[address.toLowerCase()] ?? 'Unknown Wallet';
}

interface PrecomputedHop {
  hop_number:       number;
  from_address:     string;
  to_address:       string;
  from_label:       string;
  to_label:         string;
  amount_usd:       number;
  token_symbol:     string;
  chain:            string;
  protocol:         string;
  timestamp:        string;
  tx_hash:          string;
  obfuscation_flag: 'none' | 'bridge_hop';
}

interface PrecomputedProvenance {
  hops:         PrecomputedHop[];
  origin:       string;
  origin_label: string;
  computed_at:  string;
}

async function traceWallet(
  address: string,
  chain: string,
): Promise<PrecomputedProvenance> {
  const hops: PrecomputedHop[] = [];
  let current = address.toLowerCase();
  const visited = new Set<string>();

  for (let i = 0; i < 6; i++) {
    if (visited.has(current)) break;
    visited.add(current);

    const inbound = await getWalletTransfers(chain, current, 168, 'in');
    if (inbound.length === 0) break;

    const largest = inbound.reduce((best, ev) =>
      ev.amount_usd > best.amount_usd ? ev : best,
    );
    if (largest.amount_usd < 1_000) break;

    hops.push({
      hop_number:       i + 1,
      from_address:     largest.from,
      to_address:       current,
      from_label:       resolveLabel(largest.from),
      to_label:         resolveLabel(current),
      amount_usd:       largest.amount_usd,
      token_symbol:     resolveTokenSymbol(largest.token),
      chain,
      protocol:         largest.is_bridge
        ? largest.bridge_name || 'Bridge'
        : largest.is_dex_buy ? largest.pool : 'Ethereum transfer',
      timestamp:        largest.timestamp,
      tx_hash:          largest.tx_hash,
      obfuscation_flag: largest.is_bridge ? 'bridge_hop' : 'none',
    });

    current = largest.from;
    if (ENTITY_LABELS[current]) break;
  }

  return {
    hops:         hops.reverse(),
    origin:       current,
    origin_label: resolveLabel(current),
    computed_at:  new Date().toISOString(),
  };
}

async function runPrecomputation(): Promise<void> {
  console.log('[provenance-scanner] Starting nightly pre-computation…');
  let total = 0;

  for (const chain of CHAINS) {
    // Get most recently active wallets (highest score = most recent activity)
    const wallets = await redis.zRange(
      `active:wallets:${chain}`,
      0,
      MAX_WALLETS_PER_CHAIN - 1,
      { REV: true },
    );

    console.log(`[provenance-scanner] ${chain}: ${wallets.length} active wallets`);

    for (const wallet of wallets) {
      try {
        const result = await traceWallet(wallet, chain);
        if (result.hops.length > 0) {
          const key = `provenance:precomputed:${chain}:${wallet.toLowerCase()}`;
          await redis.set(key, JSON.stringify(result), { EX: PRECOMPUTED_TTL });
          total++;
        }
      } catch (err) {
        console.error(`[provenance-scanner] Error for ${wallet}:`, err);
      }
    }
  }

  console.log(`[provenance-scanner] Complete — stored ${total} provenance chains`);
}

export function startProvenanceScanner(): cron.ScheduledTask {
  console.log('[provenance-scanner] Starting — nightly run at 02:00 UTC');
  return cron.schedule('0 2 * * *', () => {
    runPrecomputation().catch((err) =>
      console.error('[provenance-scanner] Fatal error:', err),
    );
  });
}

export async function getPrecomputedProvenance(
  chain: string,
  address: string,
): Promise<PrecomputedProvenance | null> {
  const key = `provenance:precomputed:${chain}:${address.toLowerCase()}`;
  const val = await redis.get(key);
  return val ? JSON.parse(val) as PrecomputedProvenance : null;
}
