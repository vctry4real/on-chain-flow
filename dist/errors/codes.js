export const ERROR_CODES = {
    TOKEN_NOT_FOUND: { retryable: false, http: 404 },
    WALLET_NOT_FOUND: { retryable: false, http: 404 },
    UPSTREAM_UNAVAILABLE: { retryable: true, http: 200 },
    RATE_LIMIT_EXCEEDED: { retryable: true, http: 429 },
    AUTH_REQUIRED: { retryable: false, http: 402 },
    SCHEMA_VALIDATION_FAIL: { retryable: false, http: 500 },
    CHAIN_UNSUPPORTED: { retryable: false, http: 422 },
    INVALID_ADDRESS: { retryable: false, http: 400 },
    GRAPH_TRAVERSAL_TIMEOUT: { retryable: true, http: 200 },
};
export function structuredError(code, message, partialData) {
    const { retryable } = ERROR_CODES[code];
    const payload = {
        error: { code, message, retryable, fallback_used: !!partialData },
        ...partialData,
    };
    return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(payload) }],
    };
}
//# sourceMappingURL=codes.js.map