import { z } from 'zod';
export declare const GetSupportedChainsInput: z.ZodObject<{}, z.core.$strip>;
export declare const GetSupportedChainsOutput: z.ZodObject<{
    chains: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        chain_id: z.ZodNumber;
        native_token: z.ZodString;
        rpc_provider: z.ZodString;
        bridges_supported: z.ZodArray<z.ZodString>;
        dexes_supported: z.ZodArray<z.ZodString>;
        indexed_since: z.ZodString;
    }, z.core.$strip>>;
    total_count: z.ZodNumber;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export declare const GetTrackedTokensInput: z.ZodObject<{
    chain: z.ZodDefault<z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
        all: "all";
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const GetTrackedTokensOutput: z.ZodObject<{
    tokens: z.ZodArray<z.ZodObject<{
        address: z.ZodString;
        symbol: z.ZodString;
        name: z.ZodString;
        chain: z.ZodString;
        market_cap_usd: z.ZodNullable<z.ZodNumber>;
        daily_volume_usd: z.ZodNullable<z.ZodNumber>;
        tracking_since: z.ZodString;
    }, z.core.$strip>>;
    total_count: z.ZodNumber;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export declare const BrowseByChainInput: z.ZodObject<{
    chain: z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
    }>;
    data_type: z.ZodDefault<z.ZodEnum<{
        tokens: "tokens";
        bridges: "bridges";
        dexes: "dexes";
        top_wallets: "top_wallets";
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const BrowseByChainOutput: z.ZodObject<{
    chain: z.ZodString;
    data_type: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        category: z.ZodString;
        metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>>;
    total_count: z.ZodNumber;
    fetched_at: z.ZodString;
}, z.core.$strip>;
export type GetSupportedChainsInputType = z.infer<typeof GetSupportedChainsInput>;
export type GetTrackedTokensInputType = z.infer<typeof GetTrackedTokensInput>;
export type BrowseByChainInputType = z.infer<typeof BrowseByChainInput>;
//# sourceMappingURL=discovery.d.ts.map