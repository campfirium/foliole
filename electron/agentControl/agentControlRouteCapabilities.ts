import { findAgentControlRoute } from '../../scripts/agent-control/foliole-agent-routes.mjs';

import { isCapabilityEnabled } from './agentControlCapabilities.js';
import { AGENT_CONTROL_CAPABILITIES, type AgentControlCapability } from './agentControlTypes.js';

export function capabilityForProtectedPath(method: string | undefined, pathname: string): string | null {
  return findAgentControlRoute(method, pathname)?.capability ?? null;
}

export function isProtectedRouteCapabilityDisabled(
  capability: string | null,
  isEnabled: (capability: AgentControlCapability) => boolean = isCapabilityEnabled
) {
  return isRouteCapability(capability) && !isEnabled(capability);
}

function isRouteCapability(capability: string | null): capability is AgentControlCapability {
  return Boolean(capability && (AGENT_CONTROL_CAPABILITIES as readonly string[]).includes(capability));
}
