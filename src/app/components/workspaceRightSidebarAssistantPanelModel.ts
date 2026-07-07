import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadOpeningLocation,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

export interface AssistantMessage {
  id: string;
  role: 'assistant' | 'user';
  state?: 'failed' | 'pending' | 'ready';
  text: string;
}

export type MessageCache = Record<string, AssistantMessage[]>;

type CacheAction =
  | { key: string; message: AssistantMessage; type: 'append' }
  | { fromKey: string; toKey: string; type: 'move' }
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
  return activeNode?.kind === 'topic' && !activeNode.anchorLink && !activeNode.specialKind
    ? { nodeId: activeNode.id, type: 'node' }
    : { type: 'workspace' };
}

export function resolveAssistantWorkspaceContext(
  activeNodeId: string | null,
  nodesById: Record<string, Node>
): NativeAssistantWorkspaceContext {
  const activeNode = activeNodeId ? nodesById[activeNodeId] : null;
  if (!activeNode || activeNode.specialKind || activeNode.anchorLink) return { scope: 'workspace' };
  return {
    activeNodeId: activeNode.id,
    activeTitle: activeNode.title,
    path: resolveNodePath(activeNode, nodesById),
    scope: 'node'
  };
}

function resolveNodePath(activeNode: Node, nodesById: Record<string, Node>) {
  const path: string[] = [];
  let node: Node | null | undefined = activeNode;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.title.trim()) path.unshift(node.title.trim());
    node = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  }
  return path;
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

export function createPendingMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: pendingId, role: 'assistant' as const, state: 'pending' as const, text },
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

export function createFailedMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: pendingId, role: 'assistant' as const, state: 'failed' as const, text },
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
