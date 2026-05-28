/**
 * Accumulation Scanner — background cron job.
 *
 * Production schedule: every 30 minutes, queries Neo4j for new wallet clusters
 * exhibiting coordinated buy behaviour and writes scored results to Redis.
 * The stealth_accumulation tool reads from this Redis cache; it never triggers
 * a live Neo4j query on the hot path.
 */
import cron from 'node-cron';
export declare function startAccumulationScanner(): cron.ScheduledTask;
//# sourceMappingURL=accumulation-scanner.d.ts.map