/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_CLI_CONTRACT_VERSION,
  AGENT_CONTROL_PROTOCOL_VERSION
} from './foliole-agent-routes.mjs';

export async function readAgentCliVersion(options = {}) {
  const productVersion = options.productVersion ?? await readProductVersion(options.env ?? process.env);
  return productVersion ? {
    agent_control_protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    cli_contract_version: AGENT_CLI_CONTRACT_VERSION,
    name: 'foliole',
    product_version: productVersion
  } : null;
}

async function readProductVersion(env) {
  const defaultPath = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'package.json');
  const metadataPath = env.FOLIOLE_PRODUCT_METADATA_PATH?.trim() || defaultPath;
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    return typeof metadata.version === 'string' && metadata.version.trim() ? metadata.version.trim() : null;
  } catch {
    return null;
  }
}
