import type {
  NativeAssistantAgentControlContext,
  NativeAssistantCapabilityStatus,
  NativeAssistantStatusResult
} from '../../lib/platform/nativeAssistantContract.js';
import { ensureAgentControlApiServer } from '../agentControl/agentControlServer.js';

import { resolveAssistantAgentControlContext } from './assistantAgentControlContext.js';

export async function ensureAssistantAgentControlContext(
  env: NodeJS.ProcessEnv,
  appVersion: string,
  appRoot?: string
) {
  const current = resolveAssistantAgentControlContext(env, appRoot);
  if (current.state === 'running') return current;
  await ensureAgentControlApiServer({ appVersion });
  return resolveAssistantAgentControlContext(env, appRoot);
}

export async function loadAssistantAgentControlContext(
  env: NodeJS.ProcessEnv,
  appVersion: string,
  appRoot?: string
) {
  try {
    return await ensureAssistantAgentControlContext(env, appVersion, appRoot);
  } catch {
    return resolveAssistantAgentControlContext(env, appRoot);
  }
}

export function mergeAssistantStatusWithAgentControl(
  status: NativeAssistantStatusResult,
  agentControl: NativeAssistantAgentControlContext
): NativeAssistantStatusResult {
  const agentControlEnabled = agentControl.state === 'running';
  const capabilities = upsertAssistantCapability(
    Array.isArray(status.capabilities) ? status.capabilities : [],
    'agentControl',
    agentControlEnabled
  );
  return { ...status, agentControl, capabilities };
}

function upsertAssistantCapability(
  capabilities: NativeAssistantCapabilityStatus[],
  name: 'agentControl',
  enabled: boolean
) {
  const next = capabilities.map((capability) =>
    capability.name === name ? { enabled, name } : capability
  );
  if (!next.some((capability) => capability.name === name)) next.push({ enabled, name });
  return next;
}
