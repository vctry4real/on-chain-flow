/**
 * Neo4j Cypher queries for the directed transaction graph.
 *
 * Graph schema:
 *   Node:  (:Wallet { address: string })
 *   Edge:  (from:Wallet)-[:SENT { tx_hash, token_address, token_symbol, amount_usd,
 *                                  timestamp, chain, protocol, is_bridge, is_dex_buy,
 *                                  pool, price_impact_pct }]->(to:Wallet)
 *
 * Every TransferEvent from QuickNode Streams becomes one SENT edge.
 * MERGE semantics on (tx_hash, chain) ensure idempotent ingest.
 */

import neo4j from 'neo4j-driver';
import { neo4jSession } from './client.js';
import type { TransferEvent } from '../ingest/event-processor.js';
import type { WalletClusterRaw } from '../ingest/analytics-engine.js';

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Batch-upsert a list of transfer events as SENT edges.
 * Uses UNWIND for a single round-trip regardless of batch size.
 */
export async function writeTransferEdges(events: TransferEvent[], chain: string): Promise<void> {
  const session = neo4jSession();
  if (!session) return;

  const params = events.map((e) => ({
    from_addr:        e.from,
    to_addr:          e.to,
    tx_hash:          e.tx_hash,
    chain,
    token_address:    e.token,
    token_symbol:     e.pool,  // resolved symbol stored separately; pool name here for DEX events
    amount_usd:       e.amount_usd,
    timestamp:        e.timestamp,
    protocol:         e.pool,
    is_bridge:        e.is_bridge,
    is_dex_buy:       e.is_dex_buy,
    pool:             e.pool,
    price_impact_pct: e.price_impact_pct,
  }));

  try {
    await session.run(
      `UNWIND $events AS ev
       MERGE (from:Wallet {address: ev.from_addr})
       MERGE (to:Wallet   {address: ev.to_addr})
       MERGE (from)-[r:SENT {tx_hash: ev.tx_hash, chain: ev.chain}]->(to)
       ON CREATE SET
         r.token_address    = ev.token_address,
         r.amount_usd       = ev.amount_usd,
         r.timestamp        = ev.timestamp,
         r.protocol         = ev.protocol,
         r.is_bridge        = ev.is_bridge,
         r.is_dex_buy       = ev.is_dex_buy,
         r.pool             = ev.pool,
         r.price_impact_pct = ev.price_impact_pct`,
      { events: params },
    );
  } finally {
    await session.close();
  }
}

// ─── Accumulation cluster detection ──────────────────────────────────────────

/**
 * Find wallet clusters that:
 *  - Share a common 1-hop funding source
 *  - Have all bought the same token (is_dex_buy = true) within the window
 *
 * Returns clusters ready for scoreAccumulationCluster().
 */
export async function findWalletClusters(
  tokenAddress: string,
  chain: string,
  windowHours: number,
  minWallets: number,
): Promise<WalletClusterRaw[]> {
  const session = neo4jSession();
  if (!session) return [];

  const cutoff = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  try {
    const result = await session.run(
      `MATCH (pool:Wallet)-[buy:SENT]->(buyer:Wallet)
       WHERE buy.token_address = $token_address
         AND buy.chain         = $chain
         AND buy.is_dex_buy    = true
         AND buy.timestamp     > $cutoff

       MATCH (funder:Wallet)-[fund:SENT]->(buyer)
       WHERE fund.chain      = $chain
         AND NOT fund.is_dex_buy
         AND NOT fund.is_bridge
         AND funder.address <> pool.address

       WITH funder.address AS funder_addr,
            collect(DISTINCT buyer.address) AS buyer_addrs,
            collect({
              wallet:           buyer.address,
              amount_usd:       buy.amount_usd,
              pool:             buy.pool,
              timestamp:        buy.timestamp,
              price_impact_pct: buy.price_impact_pct
            }) AS buys
       WHERE size(buyer_addrs) >= $min_wallets

       RETURN funder_addr, buyer_addrs, buys
       ORDER BY size(buyer_addrs) DESC
       LIMIT 20`,
      {
        token_address: tokenAddress.toLowerCase(),
        chain,
        cutoff,
        min_wallets:   neo4jInt(minWallets),
      },
    );

    return result.records.map((row) => ({
      wallets:       row.get('buyer_addrs') as string[],
      common_origin: row.get('funder_addr') as string,
      origin_label:  `Funding wallet ${(row.get('funder_addr') as string).slice(0, 8)}…`,
      buys:          (row.get('buys') as Array<{
        wallet: string; amount_usd: number; pool: string;
        timestamp: string; price_impact_pct: number;
      }>).map((b) => ({
        wallet:           b.wallet,
        amount_usd:       toFloat(b.amount_usd),
        pool:             b.pool ?? 'Uniswap V3',
        timestamp:        b.timestamp,
        price_impact_pct: toFloat(b.price_impact_pct),
      })),
    }));
  } finally {
    await session.close();
  }
}

// ─── Provenance traversal ─────────────────────────────────────────────────────

export interface GraphHop {
  from_addr:   string;
  to_addr:     string;
  tx_hash:     string;
  amount_usd:  number;
  token_symbol: string;
  timestamp:   string;
  protocol:    string;
  is_bridge:   boolean;
  chain:       string;
}

export interface GraphProvenance {
  hops:   GraphHop[];
  origin: string;
}

/**
 * Walk backwards from `address` up to `maxHops` hops to find the capital origin.
 * Selects the longest path with qualifying transfer amounts.
 */
export async function traceProvenanceNeo4j(
  address: string,
  chain: string,
  maxHops: number,
  minTransferUsd: number,
  includeBridgeHops: boolean,
): Promise<GraphProvenance | null> {
  const session = neo4jSession();
  if (!session) return null;

  try {
    const result = await session.run(
      `MATCH path = (origin:Wallet)-[:SENT*1..$max_hops]->(target:Wallet {address: $address})
       WHERE ALL(r IN relationships(path) WHERE
           r.chain      = $chain
         AND r.amount_usd >= $min_usd
         AND ($include_bridge OR NOT r.is_bridge)
       )
       WITH path, length(path) AS hop_count
       ORDER BY hop_count DESC
       LIMIT 1
       RETURN
         [n IN nodes(path) | n.address]                                       AS node_addresses,
         [r IN relationships(path) | {
           from_addr:    startNode(r).address,
           to_addr:      endNode(r).address,
           tx_hash:      r.tx_hash,
           amount_usd:   r.amount_usd,
           token_symbol: r.token_address,
           timestamp:    r.timestamp,
           protocol:     r.protocol,
           is_bridge:    r.is_bridge,
           chain:        r.chain
         }]                                                                    AS hops_data`,
      {
        address:        address.toLowerCase(),
        chain,
        max_hops:       neo4jInt(maxHops),
        min_usd:        minTransferUsd,
        include_bridge: includeBridgeHops,
      },
    );

    if (result.records.length === 0) return null;

    const record    = result.records[0]!;
    const addresses = record.get('node_addresses') as string[];
    const rawHops   = record.get('hops_data') as Array<{
      from_addr: string; to_addr: string; tx_hash: string;
      amount_usd: unknown; token_symbol: string; timestamp: string;
      protocol: string; is_bridge: boolean; chain: string;
    }>;

    return {
      hops:   rawHops.map((h) => ({ ...h, amount_usd: toFloat(h.amount_usd) })),
      origin: addresses[0] ?? address,
    };
  } finally {
    await session.close();
  }
}

/**
 * Get the 1-hop funding source for a wallet (non-DEX, non-bridge sender).
 */
export async function getWalletFunderNeo4j(
  address: string,
  chain: string,
): Promise<string | null> {
  const session = neo4jSession();
  if (!session) return null;

  try {
    const result = await session.run(
      `MATCH (funder:Wallet)-[t:SENT]->(wallet:Wallet {address: $address})
       WHERE t.chain      = $chain
         AND NOT t.is_dex_buy
         AND NOT t.is_bridge
       RETURN funder.address AS funder_addr
       ORDER BY t.amount_usd DESC
       LIMIT 1`,
      { address: address.toLowerCase(), chain },
    );
    if (result.records.length === 0) return null;
    return result.records[0]!.get('funder_addr') as string;
  } finally {
    await session.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function neo4jInt(n: number) {
  return neo4j.int(n);
}

function toFloat(v: unknown): number {
  if (typeof v === 'number') return v;
  // neo4j-driver returns integers as Integer objects with toNumber()
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber(): number }).toNumber();
  }
  return Number(v) || 0;
}
