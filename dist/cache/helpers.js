import { redis } from './client.js';
export async function getCached(key) {
    try {
        const val = await redis.get(key);
        return val ? JSON.parse(val) : null;
    }
    catch {
        return null;
    }
}
export async function setCache(key, value, ttlSecs = 1800) {
    try {
        await redis.set(key, JSON.stringify(value), { EX: ttlSecs });
    }
    catch {
        // cache is best-effort — swallow errors
    }
}
export async function deleteCache(key) {
    try {
        await redis.del(key);
    }
    catch {
        // swallow
    }
}
//# sourceMappingURL=helpers.js.map