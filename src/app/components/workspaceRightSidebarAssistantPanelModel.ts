import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadMessageRecord,
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadOpeningLocation,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { resolveAssistantWorkspaceContext } from './workspaceRightSidebarAssistantContext';

export { resolveAssistantWorkspaceContext };

export interface AssistantMessage {
  activity?: 'thinking';
  failureText?: string;
  id: string;
  role: 'assistant' | 'user';
  state?: 'failed' | 'pending' | 'ready';
  text: string;
}

export type MessageCache = Record<string, AssistantMessage[]>;

type CacheAction =
  | { key: string; message: AssistantMessage; type: 'append' }
  | { key: string; type: 'delete' }
  | { fromKey: string; toKey: string; type: 'move' }
  | { key: string; messages: AssistantMessage[]; type: 'set' }
  | { key: string; messageId: string; message: AssistantMessage; type: 'replace' };

export const PENDING_THREAD_KEY = '__pending_assistant_thread__';

export function messageCacheReducer(state: MessageCache, action: CacheAction): MessageCache {
  if (action.type === 'append')
    return { ...state, [action.key]: [...(state[action.key] ?? []), action.message] };
  if (action.type === 'replace') {
    return {
      ...state,
      [action.key]: (state[action.key] ?? []).map((item) =>
        item.id === action.messageId ? action.message : item
      )
    };
  }
  if (action.type === 'set') return { ...state, [action.key]: action.messages };
  if (action.type === 'delete') {
    const next = { ...state };
    delete next[action.key];
    return next;
  }
  const nextMessages = [...(state[action.toKey] ?? []), ...(state[action.fromKey] ?? [])];
  const rest = { ...state };
  delete rest[action.fromKey];
  return { ...rest, [action.toKey]: nextMessages };
}

export function resolveAssistantLocation(
  activeNodeId: string | null,
  nodesById: Record<string, Node>
): NativeAssistantThreadOpeningLocation {
  const activeNode = activeNodeId ? nodesById[activeNodeId] : null;
  return activeNode
    ? { nodeId: activeNode.id, type: 'node' }
    : { type: 'workspace' };
}

export function resolveAssistantWorkspaceContextForLocation(
  location: NativeAssistantThreadOpeningLocation,
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  editorAdapter: EditorAdapter | null,
  currentContextOverride?: NativeAssistantWorkspaceContext | undefined
): NativeAssistantWorkspaceContext {
  if (currentContextOverride) return currentContextOverride;
  if (location.type === 'workspace') return resolveAssistantWorkspaceContext(null, nodesById);
  if (!nodesById[location.nodeId]) {
    return {
      activeNodeId: location.nodeId,
      document: { bodyStatus: 'missing' },
      schemaVersion: 1,
      scope: 'node'
    };
  }
  return resolveAssistantWorkspaceContext(
    location.nodeId,
    nodesById,
    location.nodeId === activeNodeId ? editorAdapter : null
  );
}

export function resolveAssistantTurnWorkspaceContext(args: {
  activeNodeId: string | null;
  editorAdapter: EditorAdapter | null;
  location: NativeAssistantThreadOpeningLocation;
  nodesById: Record<string, Node>;
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
}): NativeAssistantWorkspaceContext {
  return resolveAssistantWorkspaceContextForLocation(
    args.selectedRecord?.location ?? args.location,
    args.activeNodeId,
    args.nodesById,
    args.editorAdapter,
    args.workspaceContextOverride
  );
}

export function threadMessagesToAssistantMessages(
  records: NativeAssistantThreadMessageRecord[]
): AssistantMessage[] {
  return records.map((record) => ({
    id: record.id,
    role: record.role,
    state: 'ready',
    text: record.text
  }));
}

export function upsertRecord(
  records: NativeAssistantThreadIndexRecord[],
  nextRecord: NativeAssistantThreadIndexRecord
) {
  return [
    nextRecord,
    ...records.filter((record) => record.providerThreadId !== nextRecord.providerThreadId)
  ];
}

export function createUserMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: `user-${pendingId}`, role: 'user' as const, state: 'ready' as const, text },
    type: 'append' as const
  };
}

export type ThreadLocationLabelKind = 'topic' | 'topicUnavailable' | 'workspace' | 'thisTopic';

export function getThreadLocationLabelKind(
  record: NativeAssistantThreadIndexRecord,
  activeNodeId: string | null,
  nodesById: Record<string, Node>
): ThreadLocationLabelKind {
  if (record.location.type === 'workspace') return 'workspace';
  if (!nodesById[record.location.nodeId]) return 'topicUnavailable';
  if (record.location.nodeId === activeNodeId) return 'thisTopic';
  return 'topic';
}

export function resolveThreadLocationPath(
  record: NativeAssistantThreadIndexRecord,
  nodesById: Record<string, Node>,
  untitledTitle = 'Untitled topic'
) {
  if (record.location.type !== 'node') return null;
  const node = nodesById[record.location.nodeId];
  if (!node) return null;
  const path: string[] = [];
  const seen = new Set<string>();
  let current: Node | null | undefined = node;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(normalizeNodeTitle(current, untitledTitle));
    current = current.parentNodeId ? nodesById[current.parentNodeId] : null;
  }
  return path.join(' / ');
}

function normalizeNodeTitle(node: Node, untitledTitle: string) {
  return node.title.trim() || untitledTitle;
}

export function createPendingMessageAction(key: string, pendingId: string) {
  return {
    key,
    message: {
      activity: 'thinking' as const,
      id: pendingId,
      role: 'assistant' as const,
      state: 'pending' as const,
      text: ''
    },
    type: 'append' as const
  };
}

export function createReadyMessageAction(
  key: string,
  pendingId: string,
  result: NativeAssistantSendMessageResult
) {
  return {
    key,
    message: {
      id: pendingId,
      role: 'assistant' as const,
      state: 'ready' as const,
      text: result.message?.text ?? ''
    },
    messageId: pendingId,
    type: 'replace' as const
  };
}

export function createFailedMessageAction(key: string, pendingId: string, text: string, partialText = '') {
  const partial = partialText.trim();
  return {
    key,
    message: {
      ...(partial ? { failureText: text } : {}),
      id: pendingId,
      role: 'assistant' as const,
      state: 'failed' as const,
      text: partial || text
    },
    messageId: pendingId,
    type: 'replace' as const
  };
}

export function createStreamingMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: pendingId, role: 'assistant' as const, state: 'pending' as const, text },
    messageId: pendingId,
    type: 'replace' as const
  };
}
