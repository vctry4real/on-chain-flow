/**
 * Bridge Monitor — background cron job.
 *
 * Production schedule: every 2 minutes, reads Kafka bridge event streams from
 * Stargate, Across, and Hop Protocol, computes rolling z-scores against the
 * 30-day baseline stored in Redis, and writes anomaly summaries.
 * The bridge_flow_anomalies tool reads from this Redis cache — it never
 * triggers live Kafka or on-chain queries on the hot path.
 */
import cron from 'node-cron';
export declare function startBridgeMonitor(): cron.ScheduledTask;
//# sourceMappingURL=bridge-monitor.d.ts.map