import type { AgentControlCapability, AgentControlCapabilityStatus } from './agentControlTypes.js';
import { AGENT_CONTROL_CAPABILITIES } from './agentControlTypes.js';

export function isCapabilityEnabled(name: AgentControlCapability): AgentControlCapabilityStatus['enabled'] {
  return AGENT_CONTROL_CAPABILITIES.includes(name);
}

export function getEnabledAgentControlCapabilities(): AgentControlCapability[] {
  return [...AGENT_CONTROL_CAPABILITIES];
}
