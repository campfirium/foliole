import type {
  NativeAssistantThreadIndexRecord,
  NativeAssistantThreadOpeningLocation
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

export function upsertRecord(
  records: NativeAssistantThreadIndexRecord[],
  nextRecord: NativeAssistantThreadIndexRecord
) {
  return [
    nextRecord,
    ...records.filter((record) => record.providerThreadId !== nextRecord.providerThreadId)
  ];
}
