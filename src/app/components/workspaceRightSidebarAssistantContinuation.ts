import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export type AssistantContinuationRelation =
  | { kind: 'destination' }
  | { kind: 'source'; destination: NativeAssistantThreadIndexRecord };

export function resolveAssistantContinuationRelation(
  records: NativeAssistantThreadIndexRecord[],
  selectedRecord: NativeAssistantThreadIndexRecord | null
): AssistantContinuationRelation | null {
  if (!selectedRecord) return null;
  if (selectedRecord.continuedFromThreadId) return { kind: 'destination' };
  const destination = records.find(
    (record) => record.continuedFromThreadId === selectedRecord.providerThreadId
  );
  return destination ? { destination, kind: 'source' } : null;
}

export function createAssistantContinuationEvent(args: {
  messages: AssistantMessage[];
  onSelectRecord: (record: NativeAssistantThreadIndexRecord) => void;
  records: NativeAssistantThreadIndexRecord[];
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  t: ReturnType<typeof useTranslation>;
}) {
  const relation = resolveAssistantContinuationRelation(args.records, args.selectedRecord);
  if (!relation) return null;
  if (relation.kind === 'destination') {
    const boundary = findContinuationBoundary(args.messages, args.selectedRecord?.createdAt);
    return boundary ? {
      afterMessageId: boundary.id,
      text: args.t('desktop.rightPanel.assistant.continuationDestination')
    } : null;
  }
  return {
    actionLabel: args.t('desktop.rightPanel.assistant.openContinuedConversation'),
    onAction: () => args.onSelectRecord(relation.destination),
    suffix: args.t('desktop.rightPanel.assistant.continuationSourceSuffix'),
    text: args.t('desktop.rightPanel.assistant.continuationSource')
  };
}

function findContinuationBoundary(messages: AssistantMessage[], threadCreatedAt?: string) {
  const boundaryTime = Date.parse(threadCreatedAt ?? '');
  if (!Number.isFinite(boundaryTime)) return null;
  return messages.find((message) =>
    message.role === 'user'
    && Date.parse(message.createdAt ?? '') >= boundaryTime
  ) ?? null;
}
