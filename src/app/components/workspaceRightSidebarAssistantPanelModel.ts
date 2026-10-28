import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadOpeningLocation
} from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

import type { AssistantMessage } from './workspaceRightSidebarAssistantMessageModel';

export type { AssistantMessage } from './workspaceRightSidebarAssistantMessageModel';

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

export function upsertRecord(
  records: NativeAssistantThreadIndexRecord[],
  nextRecord: NativeAssistantThreadIndexRecord
) {
  return [
    nextRecord,
    ...records.filter((record) => record.providerThreadId !== nextRecord.providerThreadId)
  ];
}

export function createUserMessageAction(
  key: string,
  pendingId: string,
  text: string,
  images: NativeAssistantImageDraft[] = []
) {
  return {
    key,
    message: {
      createdAt: new Date().toISOString(),
      id: `user-${pendingId}`,
      ...(images.length ? { images } : {}),
      role: 'user' as const,
      state: 'ready' as const,
      text
    },
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
