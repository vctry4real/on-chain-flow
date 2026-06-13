import neo4j, { type Driver, type Session } from 'neo4j-driver';

let driver: Driver | null = null;

export async function connectNeo4j(): Promise<void> {
  const uri  = process.env['NEO4J_URI'];
  const user = process.env['NEO4J_USERNAME'] ?? 'neo4j';
  const pass = process.env['NEO4J_PASSWORD'];

  if (!uri || !pass) {
    console.warn('[neo4j] NEO4J_URI / NEO4J_PASSWORD not set — graph features disabled');
    return;
  }

  // Never let a Neo4j outage crash the server — graph features degrade gracefully
  // to the Redis fallback paths if the connection or index setup fails.
  try {
    const candidate = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 5000,
    });

    await candidate.verifyConnectivity();
    console.log(`[neo4j] Connected to ${uri}`);

    // Idempotent index creation
    const session = candidate.session();
    try {
      await session.run(
        'CREATE INDEX wallet_address IF NOT EXISTS FOR (w:Wallet) ON (w.address)',
      );
      await session.run(
        'CREATE INDEX sent_token_chain IF NOT EXISTS FOR ()-[r:SENT]-() ON (r.token_address, r.chain)',
      );
      await session.run(
        'CREATE INDEX sent_timestamp IF NOT EXISTS FOR ()-[r:SENT]-() ON (r.timestamp)',
      );
      console.log('[neo4j] Indexes ready');
    } finally {
      await session.close();
    }

    driver = candidate;
  } catch (err) {
    console.error('[neo4j] Connection failed — graph features disabled, using Redis fallback:', err instanceof Error ? err.message : err);
    driver = null;
  }
}

export function getNeo4jDriver(): Driver | null {
  return driver;
}

export function neo4jSession(): Session | null {
  return driver ? driver.session() : null;
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
