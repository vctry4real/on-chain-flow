import { createClient } from 'redis';

export const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });

redis.on('error', (err) => console.error('[redis] error:', err));

let connected = false;

export async function connectRedis(): Promise<void> {
  if (!connected) {
    await redis.connect();
    connected = true;
  }
}
