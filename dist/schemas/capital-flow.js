import { z } from 'zod';
export const TraceCapitalFlowInput = z.object({
    address: z
        .string()
        .describe('Wallet address to trace (0x-prefixed)')
        .default('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
    max_hops: z
        .number()
        .min(1)
        .max(10)
        .default(6)
        .describe('Maximum graph hops to trace backwards'),
    include_bridge_hops: z
        .boolean()
        .default(true)
        .describe('Whether to follow cross-chain bridge transfers in the provenance chain'),
    min_transfer_usd: z
        .number()
        .default(1000)
        .describe('Minimum transfer value (USD) to include as a provenance hop'),
});
const ProvenanceHop = z.object({
    hop_number: z.number().describe('Position in the chain (1 = first hop from address)'),
    from_address: z.string(),
    to_address: z.string(),
    from_label: z.string().describe('Entity label for from_address'),
    to_label: z.string().describe('Entity label for to_address'),
    amount_usd: z.number(),
    token_symbol: z.string(),
    chain: z.string(),
    protocol: z.string().describe('Protocol used (e.g. Ethereum transfer, Stargate bridge, Uniswap V3)'),
    timestamp: z.string().describe('ISO timestamp of this transfer'),
    tx_hash: z.string(),
    obfuscation_flag: z
        .enum(['none', 'mixer', 'multi_hop_relay', 'bridge_hop', 'unknown'])
        .describe('Whether this hop shows signs of deliberate obfuscation'),
});
export const TraceCapitalFlowOutput = z.object({
    timestamp: z.string().describe('ISO 8601 timestamp of analysis'),
    subject_address: z.string(),
    subject_label: z.string().describe('Entity label for the queried address'),
    hops_traced: z.number(),
    origin_address: z.string().describe('Furthest-back traceable origin address'),
    origin_label: z.string().describe('Entity label for origin (e.g. Binance Hot Wallet 7)'),
    origin_chain: z.string(),
    provenance_chain: z.array(ProvenanceHop).describe('Ordered list of hops from origin to subject'),
    obfuscation_techniques_detected: z
        .array(z.string())
        .describe('List of obfuscation methods detected in the chain'),
    risk_flags: z
        .array(z.string())
        .describe('Compliance-relevant flags (e.g. "funds passed through known mixer")'),
    narrative: z.string().describe('Plain-English provenance story from origin to subject'),
    confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('Confidence that the full provenance chain is complete and accurate'),
    path_completeness: z
        .enum(['full', 'partial', 'origin_unknown'])
        .describe('How far back the trace was successfully resolved'),
    data_freshness: z.enum(['fresh', 'stale']).default('fresh'),
    freshness_secs: z.number(),
    data_sources: z.array(z.string()),
});
//# sourceMappingURL=capital-flow.js.map