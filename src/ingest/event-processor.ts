/**
 * Event Processor — parses raw QuickNode Streams webhook payloads.
 *
 * Decodes ERC-20 Transfer logs for tracked stablecoins and writes them to
 * Redis sorted sets keyed by (chain, token). The accumulation scanner and
 * bridge monitor read from these sets instead of generating mock data.
 */

import { redis } from '../cache/client.js';

// ─── Event signatures (keccak256 of the event ABI) ───────────────────────────
const ERC20_TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ─── Stablecoin decimals — amount / 10^decimals = USD value ──────────────────
const TOKEN_DECIMALS: Record<string, number> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,  // USDC  (Ethereum)
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,  // USDT  (Ethereum)
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6,  // USDC  (Arbitrum)
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC  (Base)
};

// ─── Known bridge contract addresses (lowercase) ─────────────────────────────
// Transfers TO these addresses are bridge outflows from Ethereum.
const BRIDGE_CONTRACTS = new Set([
  '0xdf0770df86a8034b3efef0a1bb3c889b8332ff56', // Stargate USDC pool (Ethereum)
  '0x38ea452219524bb87e18de1c24d3bb59954a1042', // Stargate USDT pool (Ethereum)
  '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5', // Across SpokePool (Ethereum)
  '0x3666f603cc164936c1b87e207f36beba4ac5f18a', // Hop USDC bridge (Ethereum)
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', // Optimism Standard Gateway
  '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', // Arbitrum Delayed Inbox
]);

// ─── Minimum transfer size to bother tracking ────────────────────────────────
const MIN_USD = 5_000;

export interface TransferEvent {
  wallet: string;       // 'from' address — the accumulator
  to: string;           // 'to' address
  amount_usd: number;
  tx_hash: string;
  timestamp: string;
  is_bridge: boolean;
}

export interface StreamPayload {
  data: Array<{
    address: string;
    topics: string[];
    data: string;
    transactionHash: string;
    blockNumber: string;
    blockTimestamp?: string;
  }>;
  metadata?: Record<string, unknown>;
}

function hexToAddress(padded: string): string {
  return '0x' + padded.slice(-40).toLowerCase();
}

function decodeUint256(hex: string, decimals: number): number {
  try {
    const val = BigInt(hex.startsWith('0x') ? hex : '0x' + hex);
    return Number(val) / 10 ** decimals;
  } catch {
    return 0;
  }
}

export async function processStreamPayload(payload: StreamPayload, chain = 'ethereum'): Promise<number> {
  const logs = payload.data ?? [];
  let stored = 0;

  const pipeline = redis.multi();

  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 !== ERC20_TRANSFER_SIG) continue;

    const tokenAddress = log.address.toLowerCase();
    const decimals = TOKEN_DECIMALS[tokenAddress];
    if (decimals === undefined) continue;

    const from = hexToAddress(log.topics[1] ?? '');
    const to   = hexToAddress(log.topics[2] ?? '');
    const amount_usd = decodeUint256(log.data, decimals);

    if (amount_usd < MIN_USD) continue;

    const isBridge = BRIDGE_CONTRACTS.has(to);
    const now = Date.now();
    const event: TransferEvent = {
      wallet: from,
      to,
      amount_usd,
      tx_hash: log.transactionHash,
      timestamp: new Date(now).toISOString(),
      is_bridge: isBridge,
    };

    // Sorted set: score = unix ms timestamp so zRange BYSCORE gives time windows
    const transferKey = `stream:transfers:${chain}:${tokenAddress}`;
    pipeline.zAdd(transferKey, { score: now, value: JSON.stringify(event) });
    pipeline.expire(transferKey, 72 * 3600);

    if (isBridge) {
      const bridgeKey = `stream:bridge_volume:${chain}:${tokenAddress}`;
      pipeline.incrByFloat(bridgeKey, amount_usd);
      pipeline.expire(bridgeKey, 24 * 3600);
    }

    stored++;
  }

  if (stored > 0) await pipeline.exec();
  return stored;
}

export async function getTransferEvents(
  chain: string,
  tokenAddress: string,
  windowHours: number,
): Promise<TransferEvent[]> {
  const key = `stream:transfers:${chain}:${tokenAddress.toLowerCase()}`;
  const minScore = Date.now() - windowHours * 3600 * 1000;
  const entries = await redis.zRange(key, minScore, '+inf', { BY: 'SCORE' });
  return entries.map((e) => JSON.parse(e) as TransferEvent);
}

export async function getBridgeVolume(chain: string, tokenAddress: string): Promise<number> {
  const key = `stream:bridge_volume:${chain}:${tokenAddress.toLowerCase()}`;
  const val = await redis.get(key);
  return val ? parseFloat(val) : 0;
}
