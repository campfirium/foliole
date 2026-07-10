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
  if (status.state !== 'ready' || agentControlEnabled) {
    return { ...status, agentControl, capabilities };
  }
  return {
    ...status,
    agentControl,
    capabilities: capabilities.map((capability) =>
      capability.name === 'sendMessage' ? { ...capability, enabled: false } : capability
    ),
    failure: { category: 'agent_control_unavailable' },
    state: 'unavailable'
  };
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
