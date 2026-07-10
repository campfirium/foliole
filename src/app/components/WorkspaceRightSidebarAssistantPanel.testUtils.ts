import type {
  NativeAssistantStatusResult,
  NativeAssistantThreadIndexRecord
} from '../../../lib/platform/nativeAssistantContract';
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
    updatedAt: overrides.updatedAt ?? '2026-07-07T00:00:00.000Z',
    ...(overrides.bodyStatus !== undefined ? { bodyStatus: overrides.bodyStatus } : {}),
    ...(overrides.hasContent !== undefined ? { hasContent: overrides.hasContent } : {}),
    ...(overrides.manualChildOrder !== undefined ? { manualChildOrder: overrides.manualChildOrder } : {}),
    ...(overrides.openingText !== undefined ? { openingText: overrides.openingText } : {}),
    ...(overrides.specialKind !== undefined ? { specialKind: overrides.specialKind } : {})
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

export function createReadyAssistantStatus(
  overrides: Partial<NativeAssistantStatusResult> = {}
): NativeAssistantStatusResult {
  return {
    agentControl: {
      capabilities: ['materials.read'],
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      state: 'running',
      trace: { count: 0 }
    },
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'agentControl' },
      { enabled: true, name: 'threadIndex' }
    ],
    provider: 'codex-app-server',
    state: 'ready',
    ...overrides
  };
}
