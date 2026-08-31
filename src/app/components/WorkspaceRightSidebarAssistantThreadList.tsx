import { Trash2 } from 'lucide-react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  InspectorList,
  InspectorListRow,
  inspectorListBodyClassName,
  inspectorListDividerClassName,
  inspectorListInsetPaddingClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

import {
  getThreadLocationLabelKind,
  resolveThreadLocationPath
} from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantThreadList(props: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  records: NativeAssistantThreadIndexRecord[];
  selectedThreadId: string | null;
  onSelectRecord: (record: NativeAssistantThreadIndexRecord) => void;
  onRemoveRecord: (record: NativeAssistantThreadIndexRecord) => void;
  removingThreadId: string | null;
}) {
  const t = useTranslation();
  return (
    <InspectorList
      ariaLabel={t('desktop.rightPanel.assistant.threads')}
      className="min-h-0 shrink-0 py-1"
    >
      {props.records.map((record) => (
        <li className={`${inspectorListDividerClassName} flex min-w-0 items-stretch`} key={record.providerThreadId}>
          <InspectorListRow
            active={record.providerThreadId === props.selectedThreadId}
            className={`${inspectorListInsetPaddingClassName} min-w-0 flex-1 py-2`}
            onClick={() => props.onSelectRecord(record)}
          >
            <span className="min-w-0">
              <span className={`${inspectorListTitleClassName} block truncate`}>
                {record.title}
              </span>
              <span className={`${inspectorListBodyClassName} block truncate`}>
                {getThreadLocationText(record, props.activeNodeId, props.nodesById, t)}
                {' · '}
                {record.provider === 'openai-compatible'
                  ? t('desktop.rightPanel.assistant.provider.historyByok')
                  : 'Codex'}
                {' · '}
                {record.preview || t('desktop.rightPanel.assistant.noPreview')}
              </span>
            </span>
          </InspectorListRow>
          <div className="flex shrink-0 items-center pr-2">
            <AppIconButton
              disabled={props.removingThreadId === record.providerThreadId}
              icon={<Trash2 aria-hidden className="size-4" strokeWidth={1.8} />}
              label={t('desktop.rightPanel.assistant.removeThread')}
              onClick={() => props.onRemoveRecord(record)}
            />
          </div>
        </li>
      ))}
    </InspectorList>
  );
}

function getThreadLocationTranslationKey(
  record: NativeAssistantThreadIndexRecord,
  activeNodeId: string | null,
  nodesById: Record<string, Node>
) {
  const kind = getThreadLocationLabelKind(record, activeNodeId, nodesById);
  if (kind === 'thisTopic') return 'desktop.rightPanel.assistant.location.thisTopic';
  if (kind === 'topicUnavailable') return 'desktop.rightPanel.assistant.location.topicUnavailable';
  if (kind === 'workspace') return 'desktop.rightPanel.assistant.location.workspace';
  return 'desktop.rightPanel.assistant.location.topic';
}

function getThreadLocationText(
  record: NativeAssistantThreadIndexRecord,
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  t: ReturnType<typeof useTranslation>
) {
  const kind = getThreadLocationLabelKind(record, activeNodeId, nodesById);
  const path = resolveThreadLocationPath(
    record,
    nodesById,
    t('desktop.rightPanel.assistant.location.untitledTopic')
  );
  if (!path) return t(getThreadLocationTranslationKey(record, activeNodeId, nodesById));
  const key = kind === 'thisTopic'
    ? 'desktop.rightPanel.assistant.location.thisTopicNamed'
    : 'desktop.rightPanel.assistant.location.topicNamed';
  return t(key, { title: path });
}
