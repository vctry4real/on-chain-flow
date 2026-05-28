export declare const ERROR_CODES: {
    readonly TOKEN_NOT_FOUND: {
        readonly retryable: false;
        readonly http: 404;
    };
    readonly WALLET_NOT_FOUND: {
        readonly retryable: false;
        readonly http: 404;
    };
    readonly UPSTREAM_UNAVAILABLE: {
        readonly retryable: true;
        readonly http: 200;
    };
    readonly RATE_LIMIT_EXCEEDED: {
        readonly retryable: true;
        readonly http: 429;
    };
    readonly AUTH_REQUIRED: {
        readonly retryable: false;
        readonly http: 402;
    };
    readonly SCHEMA_VALIDATION_FAIL: {
        readonly retryable: false;
        readonly http: 500;
    };
    readonly CHAIN_UNSUPPORTED: {
        readonly retryable: false;
        readonly http: 422;
    };
    readonly INVALID_ADDRESS: {
        readonly retryable: false;
        readonly http: 400;
    };
    readonly GRAPH_TRAVERSAL_TIMEOUT: {
        readonly retryable: true;
        readonly http: 200;
    };
};
export declare function structuredError(code: keyof typeof ERROR_CODES, message: string, partialData?: Record<string, unknown>): {
    isError: true;
    content: {
        type: "text";
        text: string;
    }[];
};
//# sourceMappingURL=codes.d.ts.map