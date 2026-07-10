import { NATIVE_COMMANDS } from './nativeCommands.js';

export type NativeAssistantProviderId = 'codex-app-server';

export type NativeAssistantStatusState =
  'busy' | 'disconnected' | 'failed' | 'ready' | 'unavailable';

export type NativeAssistantFailureCategory =
  | 'agent_control_unavailable'
  | 'auth_failed'
  | 'busy'
  | 'internal_error'
  | 'interrupted'
  | 'launch_failed'
  | 'not_configured'
  | 'overloaded'
  | 'persistence_failed'
  | 'protocol_error'
  | 'timeout';

export interface NativeAssistantFailure {
  category: NativeAssistantFailureCategory;
}

export interface NativeAssistantCapabilityStatus {
  enabled: boolean;
  name: 'agentControl' | 'sendMessage' | 'status' | 'threadIndex';
}

export interface NativeAssistantThreadNodeLocation {
  nodeId: string;
  type: 'node';
}

export interface NativeAssistantThreadWorkspaceLocation {
  type: 'workspace';
}

export type NativeAssistantThreadOpeningLocation =
  NativeAssistantThreadNodeLocation | NativeAssistantThreadWorkspaceLocation;

export type NativeAssistantThreadIndexStatus = 'active' | 'archived' | 'deleted';
export type NativeAssistantThreadReadState = 'available' | 'failed' | 'not_requested';

export interface NativeAssistantThreadIndexRecord {
  archivedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  lastOpenedAt: string;
  location: NativeAssistantThreadOpeningLocation;
  preview: string;
  provider: NativeAssistantProviderId;
  providerThreadId: string;
  readError: string | null;
  readState: NativeAssistantThreadReadState;
  status: NativeAssistantThreadIndexStatus;
  title: string;
  updatedAt: string;
}

export interface NativeAssistantThreadMessageRecord {
  createdAt: string;
  id: string;
  provider: NativeAssistantProviderId;
  providerThreadId: string;
  role: 'assistant' | 'user';
  text: string;
}

export interface NativeAssistantStatusResult {
  agentControl?: NativeAssistantAgentControlContext;
  capabilities: NativeAssistantCapabilityStatus[];
  failure?: NativeAssistantFailure;
  provider: NativeAssistantProviderId;
  state: NativeAssistantStatusState;
}

export interface NativeAssistantSendMessageArgs {
  clientTurnId?: string;
  message: string;
  openingLocation?: NativeAssistantThreadOpeningLocation;
  provider?: NativeAssistantProviderId;
  providerThreadId?: string;
  workspaceContext?: NativeAssistantWorkspaceContext;
}

export interface NativeAssistantWorkspaceChildSummary {
  anchorKind?: 'cloze' | 'highlight';
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  hasContent: boolean;
  isActive?: boolean;
  kind: string;
  nodeId: string;
  preview?: string;
  specialKind?: string;
  title: string;
  updatedAt?: string;
}

export interface NativeAssistantWorkspaceDocumentContext {
  bodyStatus: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  charCount?: number;
  preview?: string;
  truncated?: boolean;
}

export interface NativeAssistantWorkspaceFolderContext {
  childCount: number;
  children: NativeAssistantWorkspaceChildSummary[];
  truncated: boolean;
}

export interface NativeAssistantWorkspaceSelectionContext {
  charCount: number;
  ranges: Array<{ from: number; to: number }>;
  text: string;
  truncated: boolean;
}

export interface NativeAssistantWorkspaceAnchorContext {
  id: string;
  kind: 'cloze' | 'highlight';
  page?: number;
  parentNodeId?: string;
  parentTitle?: string;
  text?: string;
}

export interface NativeAssistantAgentControlContext {
  capabilities: string[];
  lastError?: string;
  state: 'failed' | 'running' | 'stopped';
}

export interface NativeAssistantWorkspaceContext {
  activeNodeId?: string;
  activeParentNodeId?: string;
  activeKind?: string;
  activeSpecialKind?: string;
  activeTitle?: string;
  agentControl?: NativeAssistantAgentControlContext;
  anchor?: NativeAssistantWorkspaceAnchorContext;
  document?: NativeAssistantWorkspaceDocumentContext;
  folder?: NativeAssistantWorkspaceFolderContext;
  path?: string[];
  parentFolder?: NativeAssistantWorkspaceFolderContext;
  selection?: NativeAssistantWorkspaceSelectionContext;
  schemaVersion?: 1;
  scope: 'node' | 'workspace';
}

export interface NativeAssistantThreadIndexListArgs {
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  location?: NativeAssistantThreadOpeningLocation;
}

export interface NativeAssistantThreadIndexMutationArgs {
  providerThreadId: string;
}

export interface NativeAssistantThreadMessageListArgs {
  providerThreadId: string;
}

export interface NativeAssistantMessageResult {
  text: string;
  threadId?: string;
  turnId?: string;
}

export interface NativeAssistantSendMessageResult {
  failure?: NativeAssistantFailure;
  message?: NativeAssistantMessageResult;
  provider: NativeAssistantProviderId;
  state: NativeAssistantStatusState;
  threadIndex?: NativeAssistantThreadIndexRecord;
}

export type NativeAssistantTurnEventKind = 'completed' | 'delta' | 'failed' | 'started';

export interface NativeAssistantTurnEvent {
  clientTurnId: string;
  failure?: NativeAssistantFailure;
  kind: NativeAssistantTurnEventKind;
  provider: NativeAssistantProviderId;
  providerThreadId?: string;
  text?: string;
  turnId?: string;
}

export type NativeAssistantCommandMap = {
  [NATIVE_COMMANDS.assistantGetStatus]: {
    args: undefined;
    result: NativeAssistantStatusResult;
  };
  [NATIVE_COMMANDS.assistantSendMessage]: {
    args: NativeAssistantSendMessageArgs;
    result: NativeAssistantSendMessageResult;
  };
  [NATIVE_COMMANDS.assistantListThreadIndex]: {
    args: NativeAssistantThreadIndexListArgs | undefined;
    result: NativeAssistantThreadIndexRecord[];
  };
  [NATIVE_COMMANDS.assistantListThreadMessages]: {
    args: NativeAssistantThreadMessageListArgs;
    result: NativeAssistantThreadMessageRecord[];
  };
  [NATIVE_COMMANDS.assistantArchiveThreadIndex]: {
    args: NativeAssistantThreadIndexMutationArgs;
    result: NativeAssistantThreadIndexRecord;
  };
  [NATIVE_COMMANDS.assistantRemoveThreadFromHistory]: {
    args: NativeAssistantThreadIndexMutationArgs;
    result: NativeAssistantThreadIndexRecord;
  };
};
