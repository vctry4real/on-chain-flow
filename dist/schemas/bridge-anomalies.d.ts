import { z } from 'zod';
export declare const BridgeFlowAnomaliesInput: z.ZodObject<{
    token_address: z.ZodDefault<z.ZodString>;
    destination_chain: z.ZodDefault<z.ZodEnum<{
        ethereum: "ethereum";
        arbitrum: "arbitrum";
        base: "base";
        optimism: "optimism";
        bnb: "bnb";
    }>>;
    hours: z.ZodDefault<z.ZodNumber>;
    sigma_threshold: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const BridgeFlowAnomaliesOutput: z.ZodObject<{
    timestamp: z.ZodString;
    token_address: z.ZodString;
    token_symbol: z.ZodString;
    destination_chain: z.ZodString;
    window_hours: z.ZodNumber;
    verdict: z.ZodEnum<{
        anomaly_detected: "anomaly_detected";
        normal_activity: "normal_activity";
        insufficient_history: "insufficient_history";
    }>;
    anomaly_score: z.ZodNumber;
    correlated_accumulation: z.ZodBoolean;
    correlation_confidence: z.ZodNumber;
    inflows: z.ZodArray<z.ZodObject<{
        source_chain: z.ZodString;
        bridge_protocol: z.ZodString;
        volume_usd: z.ZodNumber;
        baseline_volume_usd: z.ZodNumber;
        z_score: z.ZodNumber;
        receiving_wallets: z.ZodArray<z.ZodObject<{
            address: z.ZodString;
            label: z.ZodString;
            amount_usd: z.ZodNumber;
            also_accumulating: z.ZodBoolean;
        }, z.core.$strip>>;
        tx_count: z.ZodNumber;
        first_bridge_timestamp: z.ZodString;
        last_bridge_timestamp: z.ZodString;
    }, z.core.$strip>>;
    total_anomalous_volume_usd: z.ZodNumber;
    baseline_window_days: z.ZodDefault<z.ZodNumber>;
    narrative: z.ZodString;
    data_freshness: z.ZodDefault<z.ZodEnum<{
        fresh: "fresh";
        stale: "stale";
    }>>;
    freshness_secs: z.ZodNumber;
    data_sources: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BridgeFlowAnomaliesInputType = z.infer<typeof BridgeFlowAnomaliesInput>;
export type BridgeFlowAnomaliesOutputType = z.infer<typeof BridgeFlowAnomaliesOutput>;
//# sourceMappingURL=bridge-anomalies.d.ts.map