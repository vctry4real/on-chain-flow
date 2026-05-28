import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerStealthAccumulation } from './stealth-accumulation.js';
import { registerTraceCapitalFlow }    from './capital-flow.js';
import { registerBridgeFlowAnomalies } from './bridge-anomalies.js';
import { registerRawDataTools }        from './raw-data.js';
import { registerDiscoveryTools }      from './discovery.js';

export function registerAllTools(server: McpServer): void {
  registerDiscoveryTools(server);
  registerStealthAccumulation(server);
  registerTraceCapitalFlow(server);
  registerBridgeFlowAnomalies(server);
  registerRawDataTools(server);
}
