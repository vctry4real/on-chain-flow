import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const TRACE_CAPITAL_FLOW_META: {
    surface: "both";
    queryEligible: boolean;
    latencyClass: "fast";
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
export declare function registerTraceCapitalFlow(server: McpServer): void;
//# sourceMappingURL=capital-flow.d.ts.map