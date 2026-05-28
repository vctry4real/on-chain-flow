import { redis } from './client.js';

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const val = await redis.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSecs = 1800): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSecs });
  } catch {
    // cache is best-effort — swallow errors
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // swallow
  }
}
