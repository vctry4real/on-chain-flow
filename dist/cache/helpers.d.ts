export declare function getCached<T>(key: string): Promise<T | null>;
export declare function setCache(key: string, value: unknown, ttlSecs?: number): Promise<void>;
export declare function deleteCache(key: string): Promise<void>;
//# sourceMappingURL=helpers.d.ts.map