import { z } from 'zod';
export declare const GetWalletTransfersInput: z.ZodObject<{
    address: z.ZodDefault<z.ZodString>;
    chain: z.ZodDefault<z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
    hours: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const GetWalletTransfersOutput: z.ZodObject<{
    address: z.ZodString;
    chain: z.ZodString;
    transfers: z.ZodArray<z.ZodObject<{
        tx_hash: z.ZodString;
        block_number: z.ZodNumber;
        timestamp: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        token_address: z.ZodString;
        token_symbol: z.ZodString;
        amount_raw: z.ZodString;
        amount_usd: z.ZodNumber;
        protocol: z.ZodString;
        direction: z.ZodEnum<{
            out: "out";
            in: "in";
        }>;
    }, z.core.$strip>>;
    total_count: z.ZodNumber;
    data_freshness: z.ZodDefault<z.ZodEnum<{
        fresh: "fresh";
        stale: "stale";
    }>>;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export declare const GetTokenSwapsInput: z.ZodObject<{
    token_address: z.ZodDefault<z.ZodString>;
    chain: z.ZodDefault<z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
    }>>;
    hours: z.ZodDefault<z.ZodNumber>;
    dex: z.ZodDefault<z.ZodEnum<{
        "1inch": "1inch";
        all: "all";
        uniswap_v2: "uniswap_v2";
        uniswap_v3: "uniswap_v3";
        curve: "curve";
        balancer: "balancer";
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const GetTokenSwapsOutput: z.ZodObject<{
    token_address: z.ZodString;
    token_symbol: z.ZodString;
    chain: z.ZodString;
    swaps: z.ZodArray<z.ZodObject<{
        tx_hash: z.ZodString;
        timestamp: z.ZodString;
        trader: z.ZodString;
        trader_label: z.ZodString;
        dex: z.ZodString;
        pool_address: z.ZodString;
        side: z.ZodEnum<{
            buy: "buy";
            sell: "sell";
        }>;
        amount_token: z.ZodNumber;
        amount_usd: z.ZodNumber;
        price_impact_pct: z.ZodNumber;
    }, z.core.$strip>>;
    total_buy_volume_usd: z.ZodNumber;
    total_sell_volume_usd: z.ZodNumber;
    net_flow_usd: z.ZodNumber;
    total_count: z.ZodNumber;
    data_freshness: z.ZodDefault<z.ZodEnum<{
        fresh: "fresh";
        stale: "stale";
    }>>;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export declare const GetBridgeEventsInput: z.ZodObject<{
    token_address: z.ZodDefault<z.ZodString>;
    destination_chain: z.ZodDefault<z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
    }>>;
    hours: z.ZodDefault<z.ZodNumber>;
    bridge: z.ZodDefault<z.ZodEnum<{
        all: "all";
        stargate: "stargate";
        across: "across";
        hop: "hop";
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const GetBridgeEventsOutput: z.ZodObject<{
    token_address: z.ZodString;
    token_symbol: z.ZodString;
    destination_chain: z.ZodString;
    events: z.ZodArray<z.ZodObject<{
        tx_hash: z.ZodString;
        timestamp: z.ZodString;
        bridge: z.ZodString;
        source_chain: z.ZodString;
        sender: z.ZodString;
        recipient: z.ZodString;
        amount_usd: z.ZodNumber;
    }, z.core.$strip>>;
    total_volume_usd: z.ZodNumber;
    total_count: z.ZodNumber;
    data_freshness: z.ZodDefault<z.ZodEnum<{
        fresh: "fresh";
        stale: "stale";
    }>>;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export declare const GetAddressLabelsInput: z.ZodObject<{
    addresses: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const GetAddressLabelsOutput: z.ZodObject<{
    labels: z.ZodArray<z.ZodObject<{
        address: z.ZodString;
        label: z.ZodString;
        entity_type: z.ZodEnum<{
            unknown: "unknown";
            mixer: "mixer";
            whale: "whale";
            cex: "cex";
            bridge: "bridge";
            dex: "dex";
            fund: "fund";
        }>;
        tags: z.ZodArray<z.ZodString>;
        risk_score: z.ZodNumber;
    }, z.core.$strip>>;
    total_labeled: z.ZodNumber;
    total_unknown: z.ZodNumber;
    data_freshness: z.ZodDefault<z.ZodEnum<{
        fresh: "fresh";
        stale: "stale";
    }>>;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export type GetWalletTransfersInputType = z.infer<typeof GetWalletTransfersInput>;
export type GetTokenSwapsInputType = z.infer<typeof GetTokenSwapsInput>;
export type GetBridgeEventsInputType = z.infer<typeof GetBridgeEventsInput>;
export type GetAddressLabelsInputType = z.infer<typeof GetAddressLabelsInput>;
//# sourceMappingURL=raw-data.d.ts.map