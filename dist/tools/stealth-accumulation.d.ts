import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare const STEALTH_ACCUMULATION_META: {
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
export declare function registerStealthAccumulation(server: McpServer): void;
//# sourceMappingURL=stealth-accumulation.d.ts.map