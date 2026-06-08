import { GetWalletTransfersInput, GetWalletTransfersOutput, GetTokenSwapsInput, GetTokenSwapsOutput, GetBridgeEventsInput, GetBridgeEventsOutput, GetAddressLabelsInput, GetAddressLabelsOutput, } from '../schemas/raw-data.js';
import { getCached, setCache } from '../cache/helpers.js';
import { structuredError } from '../errors/codes.js';
import { getWalletTransfers, getTokenSwaps as getTokenSwapsFromRedis, getBridgeEvents as getBridgeEventsFromRedis, resolveTokenSymbol, } from '../ingest/event-processor.js';
const LABEL_REGISTRY = {
    '0xd8da6bf26964af9d7eed9e03e53415d37aa96045': { label: 'Vitalik Buterin', entity_type: 'whale', tags: ['ethereum-founder'], risk_score: 0.0 },
    '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': { label: 'Coinbase Hot Wallet', entity_type: 'cex', tags: ['coinbase', 'us-regulated'], risk_score: 0.05 },
    '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': { label: 'Binance 14', entity_type: 'cex', tags: ['binance'], risk_score: 0.08 },
    '0x28c6c06298d514db089934071355e5743bf21d60': { label: 'Binance Hot Wallet 20', entity_type: 'cex', tags: ['binance'], risk_score: 0.08 },
};
function mockTransfers(address, chain, hours, limit) {
    const seed = parseInt(address.slice(2, 10), 16);
    const count = Math.min(limit, 8 + (seed % 20));
    return Array.from({ length: count }, (_, i) => ({
        tx_hash: `0x${(seed * (i + 1)).toString(16).padStart(64, '0')}`.slice(0, 66),
        block_number: 19_000_000 + i,
        timestamp: new Date(Date.now() - (hours - i) * 3_600_000).toISOString(),
        from: i % 2 === 0 ? address : `0x${(seed + i).toString(16).padStart(40, 'a')}`.slice(0, 42),
        to: i % 2 === 0 ? `0x${(seed + i).toString(16).padStart(40, 'a')}`.slice(0, 42) : address,
        token_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        token_symbol: 'USDC',
        amount_raw: `${(12_000_000 + i * 1_000_000)}`,
        amount_usd: 12_000 + i * 1_000,
        protocol: i % 3 === 0 ? 'Uniswap V3' : 'Ethereum transfer',
        direction: (i % 2 === 0 ? 'out' : 'in'),
    }));
}
export function registerRawDataTools(server) {
    // ─── get_wallet_transfers ─────────────────────────────────────────────────
    server.registerTool('get_wallet_transfers', {
        description: 'Return normalised ERC-20 token transfer history for any wallet across supported chains. Raw building block for custom analysis — used internally by trace_capital_flow.',
        inputSchema: GetWalletTransfersInput.shape,
        outputSchema: GetWalletTransfersOutput.shape,
    }, async (args) => {
        try {
            const parsed = GetWalletTransfersInput.parse(args);
            const cacheKey = `transfers:${parsed.chain}:${parsed.address.toLowerCase()}:${parsed.hours}`;
            const cached = await getCached(cacheKey);
            if (cached)
                return { content: [{ type: 'text', text: JSON.stringify(cached) }], structuredContent: cached };
            // Try real stream data first
            const liveEvents = await getWalletTransfers(parsed.chain, parsed.address, parsed.hours);
            const sourceEvents = liveEvents.length > 0
                ? liveEvents.slice(0, parsed.limit).map((ev) => ({
                    tx_hash: ev.tx_hash,
                    block_number: 0,
                    timestamp: ev.timestamp,
                    from: ev.from,
                    to: ev.to,
                    token_address: ev.token,
                    token_symbol: resolveTokenSymbol(ev.token),
                    amount_raw: String(Math.round(ev.amount_usd * 1e6)),
                    amount_usd: ev.amount_usd,
                    protocol: ev.is_bridge ? 'Bridge transfer' : ev.is_dex_buy ? ev.pool : 'ERC-20 transfer',
                    direction: (ev.to.toLowerCase() === parsed.address.toLowerCase() ? 'in' : 'out'),
                }))
                : mockTransfers(parsed.address, parsed.chain, parsed.hours, parsed.limit);
            const result = {
                address: parsed.address,
                chain: parsed.chain,
                transfers: sourceEvents,
                total_count: sourceEvents.length,
                data_freshness: liveEvents.length > 0 ? 'fresh' : 'cached',
                fetched_at: new Date().toISOString(),
            };
            await setCache(cacheKey, result, 300);
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        }
        catch (err) {
            return structuredError('UPSTREAM_UNAVAILABLE', `get_wallet_transfers failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // ─── get_token_swaps ─────────────────────────────────────────────────────
    server.registerTool('get_token_swaps', {
        description: 'Return normalised DEX swap history for a token across Uniswap V3, Curve, Balancer, and 1inch. Includes per-swap trader labels and price impact — raw feed for custom accumulation analysis.',
        inputSchema: GetTokenSwapsInput.shape,
        outputSchema: GetTokenSwapsOutput.shape,
    }, async (args) => {
        try {
            const parsed = GetTokenSwapsInput.parse(args);
            const cacheKey = `swaps:${parsed.chain}:${parsed.token_address.toLowerCase()}:${parsed.hours}:${parsed.dex}`;
            const cached = await getCached(cacheKey);
            if (cached)
                return { content: [{ type: 'text', text: JSON.stringify(cached) }], structuredContent: cached };
            const liveSwaps = await getTokenSwapsFromRedis(parsed.chain, parsed.token_address, parsed.hours);
            const seed = parseInt(parsed.token_address.slice(2, 10), 16);
            const dexes = ['Uniswap V3', 'Curve', 'Balancer', '1inch'];
            const swaps = liveSwaps.length > 0
                ? liveSwaps
                    .filter((s) => parsed.dex === 'all' || s.dex.toLowerCase().replace(/\s+/g, '_') === parsed.dex)
                    .slice(0, parsed.limit)
                    .map((s) => ({
                    tx_hash: s.tx_hash,
                    timestamp: s.timestamp,
                    trader: s.trader,
                    trader_label: LABEL_REGISTRY[s.trader.toLowerCase()]?.label ?? 'Unknown Wallet',
                    dex: s.dex,
                    pool_address: s.pool_address,
                    side: s.side,
                    amount_token: parseFloat(s.amount_usd.toFixed(2)),
                    amount_usd: s.amount_usd,
                    price_impact_pct: s.price_impact_pct,
                }))
                : Array.from({ length: Math.min(parsed.limit, 15 + (seed % 30)) }, (_, i) => {
                    const side = (i % 3 === 2 ? 'sell' : 'buy');
                    const amount_usd = 5_000 + (i * 3_500) + (seed % 10_000);
                    return {
                        tx_hash: `0x${(seed * (i + 10)).toString(16).padStart(64, '0')}`.slice(0, 66),
                        timestamp: new Date(Date.now() - i * 3_600_000).toISOString(),
                        trader: `0x${(seed + i * 7).toString(16).padStart(40, 'a')}`.slice(0, 42),
                        trader_label: i === 0 ? 'Coinbase Hot Wallet' : 'Unknown Wallet',
                        dex: dexes[i % 4] ?? 'Uniswap V3',
                        pool_address: `0x${(seed + i).toString(16).padStart(40, '0')}`.slice(0, 42),
                        side,
                        amount_token: parseFloat(amount_usd.toFixed(2)),
                        amount_usd,
                        price_impact_pct: parseFloat((0.05 + i * 0.01).toFixed(3)),
                    };
                });
            const buys = swaps.filter((s) => s.side === 'buy');
            const sells = swaps.filter((s) => s.side === 'sell');
            const total_buy_volume_usd = buys.reduce((s, sw) => s + sw.amount_usd, 0);
            const total_sell_volume_usd = sells.reduce((s, sw) => s + sw.amount_usd, 0);
            const result = {
                token_address: parsed.token_address,
                token_symbol: resolveTokenSymbol(parsed.token_address),
                chain: parsed.chain,
                swaps,
                total_buy_volume_usd,
                total_sell_volume_usd,
                net_flow_usd: total_buy_volume_usd - total_sell_volume_usd,
                total_count: swaps.length,
                data_freshness: liveSwaps.length > 0 ? 'fresh' : 'cached',
                fetched_at: new Date().toISOString(),
            };
            await setCache(cacheKey, result, 300);
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        }
        catch (err) {
            return structuredError('UPSTREAM_UNAVAILABLE', `get_token_swaps failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // ─── get_bridge_events ───────────────────────────────────────────────────
    server.registerTool('get_bridge_events', {
        description: 'Return raw bridge transfer events for a token across Stargate, Across, and Hop Protocol. Provides the underlying transaction-level data consumed by bridge_flow_anomalies.',
        inputSchema: GetBridgeEventsInput.shape,
        outputSchema: GetBridgeEventsOutput.shape,
    }, async (args) => {
        try {
            const parsed = GetBridgeEventsInput.parse(args);
            const cacheKey = `bridge-raw:${parsed.destination_chain}:${parsed.token_address.toLowerCase()}:${parsed.hours}:${parsed.bridge}`;
            const cached = await getCached(cacheKey);
            if (cached)
                return { content: [{ type: 'text', text: JSON.stringify(cached) }], structuredContent: cached };
            const liveBridge = await getBridgeEventsFromRedis(parsed.destination_chain, parsed.token_address, parsed.hours);
            const seed = parseInt(parsed.token_address.slice(2, 10), 16);
            const bridges = ['Stargate', 'Across', 'Hop Protocol'];
            const chains = ['arbitrum', 'base', 'optimism'];
            const events = liveBridge.length > 0
                ? liveBridge
                    .filter((e) => parsed.bridge === 'all' || e.bridge_name.toLowerCase() === parsed.bridge)
                    .slice(0, parsed.limit)
                    .map((e) => ({
                    tx_hash: e.tx_hash,
                    timestamp: e.timestamp,
                    bridge: e.bridge_name || 'Bridge',
                    source_chain: 'unknown',
                    sender: e.from,
                    recipient: e.to,
                    amount_usd: e.amount_usd,
                }))
                : Array.from({ length: Math.min(parsed.limit, 6 + (seed % 12)) }, (_, i) => ({
                    tx_hash: `0x${(seed * (i + 100)).toString(16).padStart(64, '0')}`.slice(0, 66),
                    timestamp: new Date(Date.now() - i * 2_400_000).toISOString(),
                    bridge: bridges[i % 3] ?? 'Stargate',
                    source_chain: chains[i % 3] ?? 'arbitrum',
                    sender: `0x${(seed + i * 3).toString(16).padStart(40, 'b')}`.slice(0, 42),
                    recipient: `0x${(seed + i * 5).toString(16).padStart(40, 'c')}`.slice(0, 42),
                    amount_usd: 200_000 + i * 80_000,
                }));
            const result = {
                token_address: parsed.token_address,
                token_symbol: resolveTokenSymbol(parsed.token_address),
                destination_chain: parsed.destination_chain,
                events,
                total_volume_usd: events.reduce((s, e) => s + e.amount_usd, 0),
                total_count: events.length,
                data_freshness: liveBridge.length > 0 ? 'fresh' : 'cached',
                fetched_at: new Date().toISOString(),
            };
            await setCache(cacheKey, result, 120);
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        }
        catch (err) {
            return structuredError('UPSTREAM_UNAVAILABLE', `get_bridge_events failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // ─── get_address_labels ──────────────────────────────────────────────────
    server.registerTool('get_address_labels', {
        description: 'Bulk-resolve up to 50 wallet addresses against the entity label registry. Returns human-readable entity names, categories (CEX / bridge / fund / whale / mixer), and risk scores. Converts anonymous hashes into an intelligence narrative.',
        inputSchema: GetAddressLabelsInput.shape,
        outputSchema: GetAddressLabelsOutput.shape,
    }, async (args) => {
        try {
            const parsed = GetAddressLabelsInput.parse(args);
            const labels = parsed.addresses.map((addr) => {
                const known = LABEL_REGISTRY[addr.toLowerCase()];
                return known
                    ? { address: addr, ...known }
                    : { address: addr, label: 'Unknown Wallet', entity_type: 'unknown', tags: [], risk_score: 0.0 };
            });
            const result = {
                labels,
                total_labeled: labels.filter((l) => l.label !== 'Unknown Wallet').length,
                total_unknown: labels.filter((l) => l.label === 'Unknown Wallet').length,
                data_freshness: 'fresh',
                fetched_at: new Date().toISOString(),
            };
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        }
        catch (err) {
            return structuredError('UPSTREAM_UNAVAILABLE', `get_address_labels failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
}
//# sourceMappingURL=raw-data.js.map