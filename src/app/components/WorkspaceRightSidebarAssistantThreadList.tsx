import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  InspectorList,
  InspectorListRow,
  inspectorListBodyClassName,
  inspectorListDividerClassName,
  inspectorListInsetPaddingClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

export function WorkspaceRightSidebarAssistantThreadList(props: {
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
                {record.preview || t('desktop.rightPanel.assistant.noPreview')}
              </span>
            </span>
          </InspectorListRow>
        </li>
      ))}
    </InspectorList>
  );
}
