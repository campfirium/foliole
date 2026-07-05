export const AGENT_CONTROL_PROTOCOL_VERSION = 1;

export const AGENT_CONTROL_CAPABILITIES = [
  'materials.read',
  'materials.search',
  'virtualFolders.list',
  'virtualFolders.read',
  'virtualFolders.create',
  'virtualFolders.addItems',
  'virtualFolders.removeItems',
  'virtualFolders.reorder',
  'virtualFolders.write',
  'materials.update',
  'materials.deleteSoft'
] as const;

export type AgentControlCapability = (typeof AGENT_CONTROL_CAPABILITIES)[number];

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
  token: string;
}
