import path from 'node:path';

import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';
import { getEnabledAgentControlCapabilities } from '../agentControl/agentControlCapabilities.js';
import {
  getAgentControlApiServerStatus,
  getAgentControlSessionDescriptorPath
} from '../agentControl/agentControlServer.js';

export function resolveAssistantAgentDescriptorPath(env: NodeJS.ProcessEnv) {
  return env.FOLIOLE_AGENT_DESCRIPTOR?.trim() || getAgentControlSessionDescriptorPath();
}

export function resolveAssistantAgentControlCliPath(env: NodeJS.ProcessEnv, appRoot = process.cwd()) {
  return env.FOLIOLE_AGENT_CONTROL_CLI?.trim() ||
    path.resolve(appRoot, 'scripts', 'agent-control', 'foliole-agent.mjs');
}

export function resolveAssistantAgentControlCommandPath(
  env: NodeJS.ProcessEnv,
  appRoot = process.cwd(),
  platform = process.platform
) {
  const directory = path.dirname(resolveAssistantAgentControlCliPath(env, appRoot));
  return path.join(directory, platform === 'win32' ? 'foliole.cmd' : 'foliole');
}

export function resolveAssistantAgentControlContext() {
  const status = getAgentControlApiServerStatus();
  return {
    capabilities: getEnabledAgentControlCapabilities(),
    ...(status.last_error?.trim() ? { lastError: status.last_error.trim().slice(0, 180) } : {}),
    state: status.state
  };
}

export function withAgentControlContext(
  context: NativeAssistantWorkspaceContext
): NativeAssistantWorkspaceContext {
  return {
    ...context,
    agentControl: resolveAssistantAgentControlContext()
  };
}
