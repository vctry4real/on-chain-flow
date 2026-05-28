import { z } from 'zod';
export declare const TraceCapitalFlowInput: z.ZodObject<{
    address: z.ZodDefault<z.ZodString>;
    max_hops: z.ZodDefault<z.ZodNumber>;
    include_bridge_hops: z.ZodDefault<z.ZodBoolean>;
    min_transfer_usd: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const TraceCapitalFlowOutput: z.ZodObject<{
    timestamp: z.ZodString;
    subject_address: z.ZodString;
    subject_label: z.ZodString;
    hops_traced: z.ZodNumber;
    origin_address: z.ZodString;
    origin_label: z.ZodString;
    origin_chain: z.ZodString;
    provenance_chain: z.ZodArray<z.ZodObject<{
        hop_number: z.ZodNumber;
        from_address: z.ZodString;
        to_address: z.ZodString;
        from_label: z.ZodString;
        to_label: z.ZodString;
        amount_usd: z.ZodNumber;
        token_symbol: z.ZodString;
        chain: z.ZodString;
        protocol: z.ZodString;
        timestamp: z.ZodString;
        tx_hash: z.ZodString;
        obfuscation_flag: z.ZodEnum<{
            unknown: "unknown";
            none: "none";
            mixer: "mixer";
            multi_hop_relay: "multi_hop_relay";
            bridge_hop: "bridge_hop";
        }>;
    }, z.core.$strip>>;
    obfuscation_techniques_detected: z.ZodArray<z.ZodString>;
    risk_flags: z.ZodArray<z.ZodString>;
    narrative: z.ZodString;
    confidence: z.ZodNumber;
    path_completeness: z.ZodEnum<{
        full: "full";
        partial: "partial";
        origin_unknown: "origin_unknown";
    }>;
    data_freshness: z.ZodDefault<z.ZodEnum<{
        fresh: "fresh";
        stale: "stale";
    }>>;
    freshness_secs: z.ZodNumber;
    data_sources: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type TraceCapitalFlowInputType = z.infer<typeof TraceCapitalFlowInput>;
export type TraceCapitalFlowOutputType = z.infer<typeof TraceCapitalFlowOutput>;
//# sourceMappingURL=capital-flow.d.ts.map