import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  InspectorList,
  InspectorListRow,
  inspectorListBodyClassName,
  inspectorListDividerClassName,
  inspectorListInsetPaddingClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

import { getThreadLocationLabelKind } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantThreadList(props: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  records: NativeAssistantThreadIndexRecord[];
  selectedThreadId: string | null;
  onSelectRecord: (record: NativeAssistantThreadIndexRecord) => void;
}) {
  const t = useTranslation();
  return (
    <InspectorList
      ariaLabel={t('desktop.rightPanel.assistant.threads')}
      className="min-h-0 shrink-0 py-1"
    >
      {props.records.map((record) => (
        <li className={inspectorListDividerClassName} key={record.providerThreadId}>
          <InspectorListRow
            active={record.providerThreadId === props.selectedThreadId}
            className={`${inspectorListInsetPaddingClassName} py-2`}
            onClick={() => props.onSelectRecord(record)}
          >
            <span className="min-w-0">
              <span className={`${inspectorListTitleClassName} block truncate`}>
                {record.title}
              </span>
              <span className={`${inspectorListBodyClassName} block truncate`}>
                {t(getThreadLocationTranslationKey(record, props.activeNodeId, props.nodesById))}
                {' · '}
                {record.preview || t('desktop.rightPanel.assistant.noPreview')}
              </span>
            </span>
          </InspectorListRow>
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
