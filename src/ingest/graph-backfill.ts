/**
 * Graph Backfill — fetches historical USDC/USDT swap data from The Graph
 * (Uniswap V3 subgraph) and writes it into the Redis stream indexes so that
 * tools return real data immediately rather than waiting for stream accumulation.
 *
 * Runs once at startup, fire-and-forget. Falls back silently if The Graph
 * is unreachable.
 */

import { redis } from '../cache/client.js';
import type { SwapEvent, TransferEvent } from './event-processor.js';

const GRAPH_QUERY = `
  query UsdcSwapBackfill($minAmountUSD: String!, $skip: Int!) {
    swaps(
      first: 100
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
      where: {
        token0_in: [
          "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          "0xdac17f958d2ee523a2206206994597c13d831ec7"
        ]
        amountUSD_gt: $minAmountUSD
      }
    ) {
      id
      timestamp
      pool { id }
      token0 { id symbol }
      token1 { id symbol }
      sender
      recipient
      amount0
      amount1
      amountUSD
    }
  }
`;

interface GraphSwap {
  id:         string;
  timestamp:  string;
  pool:       { id: string };
  token0:     { id: string; symbol: string };
  token1:     { id: string; symbol: string };
  sender:     string;
  recipient:  string;
  amount0:    string;
  amount1:    string;
  amountUSD:  string;
}

interface GraphResponse {
  data?: { swaps: GraphSwap[] };
  errors?: Array<{ message: string }>;
}

const TTL_72H = 72 * 3600;

export async function runGraphBackfill(chain = 'ethereum'): Promise<void> {
  const endpoint = process.env['GRAPH_UNISWAP_V3_URL']
    ?? 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';

  const MAX_PAGES   = 5;   // 5 × 100 = 500 swaps max
  const MIN_USD_STR = '5000';

  console.log('[graph-backfill] Starting historical swap backfill from The Graph…');
  let totalStored = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          query:     GRAPH_QUERY,
          variables: { minAmountUSD: MIN_USD_STR, skip: page * 100 },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error('[graph-backfill] Fetch failed:', err);
      break;
    }

    const json = await res.json() as GraphResponse;
    if (json.errors?.length) {
      console.error('[graph-backfill] GraphQL errors:', json.errors[0]?.message);
      break;
    }

    const swaps = json.data?.swaps ?? [];
    if (swaps.length === 0) break;

    const pipeline = redis.multi();

    for (const s of swaps) {
      const amountUsd = parseFloat(s.amountUSD);
      if (amountUsd < 5_000) continue;

      const score = parseInt(s.timestamp, 10) * 1000;   // unix ms
      // amount0 < 0 means token0 flowed out of pool → user received token0 (buy)
      // amount0 > 0 means token0 flowed into pool → user sent token0 (sell)
      const token0IsBought = parseFloat(s.amount0) < 0;
      const tokenAddress   = (token0IsBought ? s.token0.id : s.token1.id).toLowerCase();
      const side: 'buy' | 'sell' = token0IsBought ? 'buy' : 'sell';

      const priceImpact = parseFloat(
        Math.min(2.0, 0.02 + Math.log10(Math.max(1, amountUsd / 10_000)) * 0.1).toFixed(4),
      );

      const swap: SwapEvent = {
        trader:           side === 'buy' ? s.recipient : s.sender,
        pool_address:     s.pool.id,
        dex:              'Uniswap V3',
        token_address:    tokenAddress,
        side,
        amount_usd:       amountUsd,
        price_impact_pct: priceImpact,
        tx_hash:          s.id.split('#')[0] ?? s.id,
        timestamp:        new Date(score).toISOString(),
      };

      pipeline.zAdd(`stream:dex_swap:${chain}:${tokenAddress}`, { score, value: JSON.stringify(swap) });
      pipeline.expire(`stream:dex_swap:${chain}:${tokenAddress}`, TTL_72H);

      // Also populate wallet secondary indexes so trace_capital_flow has data
      const te: TransferEvent = {
        wallet:           s.recipient,
        from:             s.sender,
        to:               s.recipient,
        amount_usd:       amountUsd,
        tx_hash:          s.id.split('#')[0] ?? s.id,
        timestamp:        new Date(score).toISOString(),
        token:            tokenAddress,
        is_bridge:        false,
        is_dex_buy:       side === 'buy',
        pool:             'Uniswap V3',
        price_impact_pct: priceImpact,
        bridge_name:      '',
      };

      const teSerialized = JSON.stringify(te);
      pipeline.zAdd(`stream:wallet_in:${chain}:${s.recipient}`,  { score, value: teSerialized });
      pipeline.expire(`stream:wallet_in:${chain}:${s.recipient}`, TTL_72H);
      pipeline.zAdd(`stream:wallet_out:${chain}:${s.sender}`, { score, value: teSerialized });
      pipeline.expire(`stream:wallet_out:${chain}:${s.sender}`, TTL_72H);
      pipeline.set(`stream:funder:${chain}:${s.recipient}`, s.sender, { EX: TTL_72H });

      totalStored++;
    }

    await pipeline.exec();
    if (swaps.length < 100) break;   // last page
  }

  console.log(`[graph-backfill] Complete — stored ${totalStored} historical swaps`);
}
