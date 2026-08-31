import type {
  NativeAssistantProviderId,
  NativeAssistantThreadIndexRecord
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

export type AssistantProviderState = {
  byokConfigured: boolean;
  byokModel: string;
  codexReady: boolean;
  onSelectProvider: (provider: NativeAssistantProviderId) => Promise<void>;
  selectedProvider: NativeAssistantProviderId;
};

export function createAssistantProviderControls(
  state: AssistantProviderState,
  selectedRecord: NativeAssistantThreadIndexRecord | null
) {
  return {
    byokConfigured: state.byokConfigured,
    byokModel: state.byokModel,
    codexReady: state.codexReady,
    onSelect: state.onSelectProvider,
    provider: selectedRecord?.provider ?? state.selectedProvider,
    threadBound: Boolean(selectedRecord)
  };
}

export function isAssistantProviderReady(
  provider: NativeAssistantProviderId,
  state: Pick<AssistantProviderState, 'byokConfigured' | 'codexReady'>
) {
  return provider === 'codex-app-server' ? state.codexReady : state.byokConfigured;
}

export function findSelectedAssistantRecord(
  records: NativeAssistantThreadIndexRecord[],
  selectedThreadId: string | null
) {
  return records.find((record) => record.providerThreadId === selectedThreadId) ?? null;
}

export function selectAssistantRecord(
  record: NativeAssistantThreadIndexRecord,
  nodesById: Record<string, Node>,
  onSelectNode: (nodeId: string) => void,
  selectThreadId: (threadId: string | null) => void
) {
  selectThreadId(record.providerThreadId);
  if (record.location.type === 'node' && nodesById[record.location.nodeId]) {
    onSelectNode(record.location.nodeId);
  }
}

export function getSelectedAssistantThreadNotice(
  record: NativeAssistantThreadIndexRecord | null,
  nodesById: Record<string, Node>,
  unavailableText: string
) {
  return record?.location.type === 'node' && !nodesById[record.location.nodeId]
    ? unavailableText
    : null;
}
