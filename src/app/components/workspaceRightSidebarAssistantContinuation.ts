import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { useTranslation } from '../../shared/localization/LocalizationProvider';

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
  onSelectRecord: (record: NativeAssistantThreadIndexRecord) => void;
  records: NativeAssistantThreadIndexRecord[];
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  t: ReturnType<typeof useTranslation>;
}) {
  const relation = resolveAssistantContinuationRelation(args.records, args.selectedRecord);
  if (!relation) return null;
  if (relation.kind === 'destination') return {
    placement: 'after-user' as const,
    text: args.t('desktop.rightPanel.assistant.continuationDestination')
  };
  return {
    actionLabel: args.t('desktop.rightPanel.assistant.openContinuedConversation'),
    onAction: () => args.onSelectRecord(relation.destination),
    placement: 'after-messages' as const,
    text: args.t('desktop.rightPanel.assistant.continuationSource')
  };
}
