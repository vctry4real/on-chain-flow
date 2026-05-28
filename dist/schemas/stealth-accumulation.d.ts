import { z } from 'zod';
export declare const StealthAccumulationInput: z.ZodObject<{
    token_address: z.ZodDefault<z.ZodString>;
    chain: z.ZodDefault<z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
    }>>;
    hours: z.ZodDefault<z.ZodNumber>;
    min_confidence: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const StealthAccumulationOutput: z.ZodObject<{
    timestamp: z.ZodString;
    token_address: z.ZodString;
    token_symbol: z.ZodString;
    chain: z.ZodString;
    window_hours: z.ZodNumber;
    classifier_version: z.ZodString;
    verdict: z.ZodEnum<{
        accumulation_detected: "accumulation_detected";
        no_signal: "no_signal";
        insufficient_data: "insufficient_data";
    }>;
    confidence: z.ZodNumber;
    score_breakdown: z.ZodObject<{
        order_size_distribution: z.ZodNumber;
        timing_variance: z.ZodNumber;
        pool_diversity: z.ZodNumber;
        price_impact_management: z.ZodNumber;
        common_origin_strength: z.ZodNumber;
        weighted_score: z.ZodNumber;
        logistic_probability: z.ZodNumber;
        feature_weights: z.ZodObject<{
            timing_variance: z.ZodNumber;
            price_impact_management: z.ZodNumber;
            pool_diversity: z.ZodNumber;
            order_size_distribution: z.ZodNumber;
            common_origin_strength: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    clusters: z.ZodArray<z.ZodObject<{
        wallets: z.ZodArray<z.ZodString>;
        common_origin: z.ZodString;
        origin_label: z.ZodString;
        collective_position_usd: z.ZodNumber;
        median_order_size_usd: z.ZodNumber;
        pools_used: z.ZodArray<z.ZodString>;
        timing_variance_minutes: z.ZodNumber;
        activity_consistent_with: z.ZodEnum<{
            human_coordinated: "human_coordinated";
            bot_automated: "bot_automated";
            ambiguous: "ambiguous";
        }>;
        first_buy_timestamp: z.ZodString;
        last_buy_timestamp: z.ZodString;
    }, z.core.$strip>>;
    total_volume_usd: z.ZodNumber;
    narrative: z.ZodString;
    data_freshness: z.ZodEnum<{
        fresh: "fresh";
        cached: "cached";
        stale: "stale";
    }>;
    freshness_secs: z.ZodNumber;
    data_sources: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type StealthAccumulationInputType = z.infer<typeof StealthAccumulationInput>;
export type StealthAccumulationOutputType = z.infer<typeof StealthAccumulationOutput>;
//# sourceMappingURL=stealth-accumulation.d.ts.map