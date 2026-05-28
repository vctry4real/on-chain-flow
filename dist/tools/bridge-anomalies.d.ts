import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const BRIDGE_FLOW_ANOMALIES_META: {
    surface: "both";
    queryEligible: boolean;
    latencyClass: "instant";
    pricing: {
        executeUsd: string;
    };
    rateLimit: {
        maxRequestsPerMinute: number;
        cooldownMs: number;
        maxConcurrency: number;
    };
    dataBroker: {
        deterministic: boolean;
        auditFields: string[];
    };
};
export declare function registerBridgeFlowAnomalies(server: McpServer): void;
//# sourceMappingURL=bridge-anomalies.d.ts.map