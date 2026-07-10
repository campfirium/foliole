import { AGENT_CONTROL_PRODUCT_CAPABILITIES } from '../../scripts/agent-control/foliole-agent-routes.mjs';

export const AGENT_CONTROL_PROTOCOL_VERSION = 1;

export const AGENT_CONTROL_CAPABILITIES = AGENT_CONTROL_PRODUCT_CAPABILITIES;

type RegisteredAgentControlCapability = (typeof AGENT_CONTROL_CAPABILITIES)[number];
export type AgentControlCapability = string extends RegisteredAgentControlCapability
  ? never
  : RegisteredAgentControlCapability;

export type AgentControlAuditResult = 'auth_failed' | 'failed' | 'success';

export interface AgentControlAuditEvent {
  capability: string;
  callerId: string;
  errorCategory?: string;
  occurredAt: string;
  result: AgentControlAuditResult;
  targetId?: string;
}

export interface AgentControlCapabilityStatus {
  enabled: boolean;
  name: AgentControlCapability;
}

export interface AgentControlRuntimeIdentity {
  boot_id: string;
  database_device_id_hash: string | null;
  pid: number;
  started_at: string;
}

export interface AgentControlServerStatus {
  endpoint: string | null;
  last_error: string | null;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
}

export interface AgentControlSessionDescriptor {
  capabilities: AgentControlCapability[];
  endpoint: string;
  pid: number;
  protocol_version: typeof AGENT_CONTROL_PROTOCOL_VERSION;
  started_at: string;
  runtime_identity: AgentControlRuntimeIdentity;
  token: string;
}
