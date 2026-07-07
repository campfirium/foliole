import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

export function createAssistantPanelNode(overrides: Partial<Node>): Node {
  return {
    anchorLink: overrides.anchorLink ?? null,
    content: overrides.content ?? '',
    createdAt: '2026-07-07T00:00:00.000Z',
    id: overrides.id ?? 'node-1',
    kind: overrides.kind ?? 'topic',
    parentNodeId: overrides.parentNodeId ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    title: overrides.title ?? 'Topic',
    updatedAt: '2026-07-07T00:00:00.000Z'
  };
}

export function createAssistantPanelThread(
  overrides: Partial<NativeAssistantThreadIndexRecord>
): NativeAssistantThreadIndexRecord {
  return {
    archivedAt: null,
    createdAt: '2026-07-07T00:00:00.000Z',
    deletedAt: null,
    lastOpenedAt: '2026-07-07T00:00:00.000Z',
    location: { nodeId: 'node-1', type: 'node' },
    preview: 'Original prompt',
    provider: 'codex-app-server',
    providerThreadId: 'thread-1',
    readError: null,
    readState: 'not_requested',
    status: 'active',
    title: 'Original prompt',
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...overrides
  };
}
