/**
 * Cardano network configuration helper
 * Stack: Blockfrost as primary chain provider (replaces self-hosted Ogmios/Kupo)
 */
import { NETWORK_CONFIG, type NetworkConfig } from '@solvernet/shared';
import { env } from './env.js';

export function getNetworkConfig(): NetworkConfig {
  const base = NETWORK_CONFIG[env.CARDANO_NETWORK];

  if (!base) {
    throw new Error(`Unknown network: ${env.CARDANO_NETWORK}`);
  }

  return {
    ...base,
    blockfrostUrl: env.BLOCKFROST_URL,
    blockfrostApiKey: env.BLOCKFROST_PROJECT_ID,
  };
}
