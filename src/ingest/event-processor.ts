/**
 * Event Processor — parses raw QuickNode Streams webhook payloads.
 *
 * Redis key schema:
 *   stream:transfers:{chain}:{tokenAddress}    ZSET  score=unix-ms  TTL 72h
 *   stream:dex_swap:{chain}:{tokenAddress}     ZSET  score=unix-ms  TTL 72h
 *   stream:wallet_in:{chain}:{address}         ZSET  score=unix-ms  TTL 72h
 *   stream:wallet_out:{chain}:{address}        ZSET  score=unix-ms  TTL 72h
 *   stream:funder:{chain}:{address}            STRING funderAddress  TTL 72h
 *   stream:bridge_volume:{chain}:{tokenAddress} STRING float         TTL 24h
 */

import { redis } from '../cache/client.js';
import { writeTransferEdges } from '../graph/queries.js';

const ERC20_TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const TOKEN_DECIMALS: Record<string, number> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6,   // USDC (Ethereum)
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 6,   // USDT (Ethereum)
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6,   // USDC (Arbitrum)
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,   // USDC (Base)
  '0x6b175474e89094c44da98b954eedeac495271d0f': 18,  // DAI  (1 DAI ≈ $1, amount maps directly to USD)
};

const TOKEN_SYMBOLS: Record<string, string> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'LINK',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',
};

export function resolveTokenSymbol(tokenAddress: string): string {
  return TOKEN_SYMBOLS[tokenAddress.toLowerCase()] ?? tokenAddress.slice(0, 6).toUpperCase();
}

// Transfers FROM these addresses = user bought the tracked token from a DEX
const DEX_POOLS: Record<string, string> = {
  // Uniswap V3 USDC pools (Ethereum)
  '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640': 'Uniswap V3',  // USDC/ETH 0.05%
  '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8': 'Uniswap V3',  // USDC/ETH 0.3%
  '0x7bea39867e4169dbe237d55c8242a8f2fcdcc387': 'Uniswap V3',  // USDC/ETH 1%
  '0x3416cf6c708da44db2624d63ea0aaef7113527c6': 'Uniswap V3',  // USDC/USDT 0.01%
  '0x99ac8ca7087fa4a2a1fb6357269965a2014abc35': 'Uniswap V3',  // USDC/WBTC 0.3%
  '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36': 'Uniswap V3',  // USDT/ETH 0.3%
  // Curve (Ethereum)
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7': 'Curve',       // 3pool (DAI/USDC/USDT)
  '0xa5407eae9ba41422680e2e00537571bcc53efbfd': 'Curve',       // sUSD pool
  '0xdcef968d416a41cdac0ed8702fac8128a64241a2': 'Curve',       // FRAX/USDC
  // Balancer (Ethereum)
  '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56': 'Balancer',    // WETH/USDC 80/20
  '0x06df3b2bbb68adc8b0e302443692037ed9f91b42': 'Balancer',    // stable pool
  // Uniswap V2 USDC/USDT pairs (Ethereum)
  '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc': 'Uniswap V2',  // USDC/WETH
  '0x3041cbd36888becc7bbcbc0045e3b1f144466f5f': 'Uniswap V2',  // USDC/USDT
  '0x004375dff511095cc5a197a54140a24efef3a416': 'Uniswap V2',  // USDC/WBTC
  '0xae461ca67b15dc8dc81ce7615e0320da1a9ab8d5': 'Uniswap V2',  // USDC/DAI
  '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852': 'Uniswap V2',  // USDT/WETH
  // 1inch
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch',
  // Uniswap V3 (Arbitrum)
  '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443': 'Uniswap V3',
  // Uniswap V3 (Base)
  '0xd0b53d9277642d899df5c87a3966a349a798f224': 'Uniswap V3',
};

const BRIDGE_CONTRACTS = new Set([
  '0xdf0770df86a8034b3efef0a1bb3c889b8332ff56', // Stargate USDC pool (Ethereum)
  '0x38ea452219524bb87e18de1c24d3bb59954a1042', // Stargate USDT pool (Ethereum)
  '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5', // Across SpokePool (Ethereum)
  '0x3666f603cc164936c1b87e207f36beba4ac5f18a', // Hop USDC bridge (Ethereum)
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1', // Optimism Standard Gateway
  '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f', // Arbitrum Delayed Inbox
]);

const BRIDGE_NAMES: Record<string, string> = {
  '0xdf0770df86a8034b3efef0a1bb3c889b8332ff56': 'Stargate',
  '0x38ea452219524bb87e18de1c24d3bb59954a1042': 'Stargate',
  '0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5': 'Across',
  '0x3666f603cc164936c1b87e207f36beba4ac5f18a': 'Hop',
  '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1': 'Optimism Gateway',
  '0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f': 'Arbitrum Gateway',
};

// Minimum transfer value (USD) to index. Tuned low enough to capture the many
// small, coordinated buys that characterise stealth accumulation, while filtering
// out dust. Override per-deployment with MIN_TRANSFER_USD.
const MIN_USD   = parseInt(process.env['MIN_TRANSFER_USD'] ?? '500', 10);
const TTL_72H   = 72 * 3600;
const TTL_24H   = 24 * 3600;

export interface TransferEvent {
  wallet:           string;   // recipient (to) — the accumulator
  from:             string;
  to:               string;
  amount_usd:       number;
  tx_hash:          string;
  timestamp:        string;
  token:            string;   // token contract address
  is_bridge:        boolean;
  is_dex_buy:       boolean;
  pool:             string;   // DEX name, bridge name, or 'Direct'
  price_impact_pct: number;
  bridge_name:      string;   // bridge protocol name if is_bridge, else ''
}

export interface SwapEvent {
  trader:           string;
  pool_address:     string;
  dex:              string;
  token_address:    string;
  side:             'buy' | 'sell';
  amount_usd:       number;
  price_impact_pct: number;
  tx_hash:          string;
  timestamp:        string;
}

export interface StreamPayload {
  data: Array<{
    address:          string;
    topics:           string[];
    data:             string;
    transactionHash:  string;
    blockNumber:      string;
    blockTimestamp?:  string;
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

function estimatePriceImpact(amount_usd: number): number {
  // Log approximation: $10k→0.05%, $100k→0.15%, $1M→0.35%
  return parseFloat(Math.min(2.0, 0.02 + Math.log10(Math.max(1, amount_usd / 10_000)) * 0.1).toFixed(4));
}

type RawLog = StreamPayload['data'][number];

// Recursively collect every log-shaped object (has `topics` + `address`) from an
// arbitrarily nested QuickNode payload. Robust to flat arrays, data[block][tx][log]
// nesting, and an extra { data: ... } wrapper QuickNode may add around filter output.
function collectLogs(node: unknown, out: RawLog[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLogs(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj['topics']) && typeof obj['address'] === 'string') {
      out.push(obj as unknown as RawLog);
      return;
    }
    if ('data' in obj) collectLogs(obj['data'], out);
  }
}

export async function processStreamPayload(payload: StreamPayload, chain = 'ethereum'): Promise<number> {
  const logs: RawLog[] = [];
  collectLogs(payload, logs);
  let stored = 0;
  const pipeline    = redis.multi();
  const graphEvents: TransferEvent[] = [];

  for (const log of logs) {
    const topic0 = log.topics[0]?.toLowerCase();
    if (topic0 !== ERC20_TRANSFER_SIG) continue;

    const tokenAddress = log.address.toLowerCase();
    const decimals = TOKEN_DECIMALS[tokenAddress];
    if (decimals === undefined) continue;

    const from       = hexToAddress(log.topics[1] ?? '');
    const to         = hexToAddress(log.topics[2] ?? '');
    const amount_usd = decodeUint256(log.data, decimals);
    if (amount_usd < MIN_USD) continue;

    const now        = Date.now();
    const isDexBuy   = DEX_POOLS[from] !== undefined;
    const isDexSell  = DEX_POOLS[to] !== undefined;
    const isBridge   = BRIDGE_CONTRACTS.has(to);
    const dexName    = DEX_POOLS[from] ?? DEX_POOLS[to] ?? '';
    const bridgeName = BRIDGE_NAMES[to] ?? '';
    const pool       = dexName || bridgeName || 'Direct';

    const event: TransferEvent = {
      wallet:           to,   // recipient is always the accumulator
      from,
      to,
      amount_usd,
      tx_hash:          log.transactionHash,
      timestamp:        new Date(now).toISOString(),
      token:            tokenAddress,
      is_bridge:        isBridge,
      is_dex_buy:       isDexBuy,
      pool,
      price_impact_pct: (isDexBuy || isDexSell) ? estimatePriceImpact(amount_usd) : 0,
      bridge_name:      bridgeName,
    };

    graphEvents.push(event);

    const serialized = JSON.stringify(event);
    const scoreObj   = { score: now, value: serialized };

    // Primary: all transfers for this token
    pipeline.zAdd(`stream:transfers:${chain}:${tokenAddress}`, scoreObj);
    pipeline.expire(`stream:transfers:${chain}:${tokenAddress}`, TTL_72H);

    // Secondary wallet indexes — enable per-wallet lookups for trace_capital_flow
    pipeline.zAdd(`stream:wallet_in:${chain}:${to}`, scoreObj);
    pipeline.expire(`stream:wallet_in:${chain}:${to}`, TTL_72H);
    pipeline.zAdd(`stream:wallet_out:${chain}:${from}`, scoreObj);
    pipeline.expire(`stream:wallet_out:${chain}:${from}`, TTL_72H);

    // Funding source index — 1-hop origin approximation for cluster common-origin detection.
    // Only record non-DEX, non-bridge senders so we get the real funding wallet, not a pool address.
    if (!isDexBuy && !isBridge) {
      pipeline.set(`stream:funder:${chain}:${to}`, from, { EX: TTL_72H });
    }

    // DEX swap index
    if (isDexBuy || isDexSell) {
      const swap: SwapEvent = {
        trader:           isDexBuy ? to : from,
        pool_address:     isDexBuy ? from : to,
        dex:              dexName,
        token_address:    tokenAddress,
        side:             isDexBuy ? 'buy' : 'sell',
        amount_usd,
        price_impact_pct: estimatePriceImpact(amount_usd),
        tx_hash:          log.transactionHash,
        timestamp:        new Date(now).toISOString(),
      };
      pipeline.zAdd(`stream:dex_swap:${chain}:${tokenAddress}`, { score: now, value: JSON.stringify(swap) });
      pipeline.expire(`stream:dex_swap:${chain}:${tokenAddress}`, TTL_72H);
    }

    // Active wallet index — used by nightly provenance pre-computation scanner
    pipeline.zAdd(`active:wallets:${chain}`, { score: now, value: to });
    pipeline.expire(`active:wallets:${chain}`, 72 * 3600);

    // Bridge tracking
    if (isBridge) {
      pipeline.incrByFloat(`stream:bridge_volume:${chain}:${tokenAddress}`, amount_usd);
      pipeline.expire(`stream:bridge_volume:${chain}:${tokenAddress}`, TTL_24H);
    }

    stored++;
  }

  if (stored > 0) {
    await pipeline.exec();
    // Fire-and-forget Neo4j write — does not block the webhook response
    writeTransferEdges(graphEvents, chain).catch((err) =>
      console.error('[neo4j] writeTransferEdges failed:', err),
    );
  }
  return stored;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

// Read all members of a ZSET by index and filter by the embedded ISO timestamp in
// JS. Avoids the BY-SCORE range query, whose numeric-bound handling silently
// returned nothing under node-redis v5. TTLs keep these sets small (≤72h of data).
async function readRecentZSet<T extends { timestamp: string }>(
  key: string,
  windowHours: number,
): Promise<T[]> {
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const raw    = await redis.zRange(key, 0, -1);
  const out: T[] = [];
  for (const e of raw) {
    try {
      const obj = JSON.parse(e) as T;
      if (new Date(obj.timestamp).getTime() >= cutoff) out.push(obj);
    } catch { /* skip malformed entry */ }
  }
  return out;
}

export async function getTransferEvents(
  chain: string,
  tokenAddress: string,
  windowHours: number,
): Promise<TransferEvent[]> {
  return readRecentZSet<TransferEvent>(`stream:transfers:${chain}:${tokenAddress.toLowerCase()}`, windowHours);
}

export async function getWalletTransfers(
  chain: string,
  address: string,
  windowHours: number,
  direction: 'in' | 'out' | 'both' = 'both',
): Promise<TransferEvent[]> {
  const addr     = address.toLowerCase();
  const results: TransferEvent[] = [];

  if (direction === 'in' || direction === 'both') {
    results.push(...await readRecentZSet<TransferEvent>(`stream:wallet_in:${chain}:${addr}`, windowHours));
  }
  if (direction === 'out' || direction === 'both') {
    results.push(...await readRecentZSet<TransferEvent>(`stream:wallet_out:${chain}:${addr}`, windowHours));
  }

  // Deduplicate (same tx can appear in both in and out if self-transfer, unlikely but safe)
  const seen = new Set<string>();
  return results.filter((e) => {
    const key = `${e.tx_hash}:${e.from}:${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getFundingSource(chain: string, address: string): Promise<string | null> {
  return redis.get(`stream:funder:${chain}:${address.toLowerCase()}`);
}

export async function getTokenSwaps(
  chain: string,
  tokenAddress: string,
  windowHours: number,
): Promise<SwapEvent[]> {
  return readRecentZSet<SwapEvent>(`stream:dex_swap:${chain}:${tokenAddress.toLowerCase()}`, windowHours);
}

export async function getBridgeEvents(
  chain: string,
  tokenAddress: string,
  windowHours: number,
): Promise<TransferEvent[]> {
  const all = await getTransferEvents(chain, tokenAddress, windowHours);
  return all.filter((e) => e.is_bridge);
}

export async function getBridgeVolume(chain: string, tokenAddress: string): Promise<number> {
  const val = await redis.get(`stream:bridge_volume:${chain}:${tokenAddress.toLowerCase()}`);
  return val ? parseFloat(val) : 0;
}

export { BRIDGE_NAMES };
