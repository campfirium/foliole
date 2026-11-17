import { Trash2 } from 'lucide-react';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppIconButton,
  InspectorList,
  inspectorListDividerLineClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

import { WorkspaceRightSidebarAssistantMaterialTags } from './WorkspaceRightSidebarAssistantMaterialTags';

const rowHighlightClassName = 'before:pointer-events-none before:absolute before:inset-x-inspector-list-inset before:inset-y-px before:-z-local-raised before:transition-colors';

type ThreadListProps = {
  onOpenMaterial: (nodeId: string) => void;
  trashedNodeIds?: readonly string[] | undefined;
  nodesById: Record<string, Node>;
  records: NativeAssistantThreadIndexRecord[];
  selectedThreadId: string | null;
  onSelectRecord: (record: NativeAssistantThreadIndexRecord) => void;
  onRemoveRecord: (record: NativeAssistantThreadIndexRecord) => void;
  removingThreadId: string | null;
};

export function WorkspaceRightSidebarAssistantThreadList(props: ThreadListProps) {
  const t = useTranslation();
  return (
    <InspectorList
      ariaLabel={t('desktop.rightPanel.assistant.threads')}
      className="min-h-0 shrink-0 py-1"
    >
      {props.records.map((record) => (
        <AssistantHistoryRow key={record.providerThreadId} record={record} list={props} />
      ))}
    </InspectorList>
  );
}

function AssistantHistoryRow({ record, list }: { record: NativeAssistantThreadIndexRecord; list: ThreadListProps }) {
  const t = useTranslation();
  const active = record.providerThreadId === list.selectedThreadId;
  const preview = record.preview || t('desktop.rightPanel.assistant.noPreview');
  const showPreview = record.title.trim() !== preview.trim();
  return (
    <li
      className={cn(
        'group/history-row relative isolate flex min-w-0 items-start gap-2 py-2 pl-inspector-list-inset pr-2',
        rowHighlightClassName,
        active
          ? 'before:bg-[color-mix(in_srgb,var(--app-surface)_88%,rgb(var(--role-accent-rgb))_12%)]'
          : 'hover:before:bg-[color-mix(in_srgb,var(--app-surface)_96%,rgb(var(--role-ink-rgb))_4%)]'
      )}
    >
      <div className="min-w-0 flex-1">
        <button
          aria-current={active || undefined}
          className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => list.onSelectRecord(record)}
          type="button"
        >
          <span className={`${inspectorListTitleClassName} block truncate`} title={record.title}>
            {record.title}
          </span>
          <span className="block h-10">
            {showPreview && (
              <span className="line-clamp-2 break-words text-ui-base leading-5 text-foreground/68" title={preview}>
                {preview}
              </span>
            )}
          </span>
        </button>
        <div className="mt-0.5 h-5">
          <WorkspaceRightSidebarAssistantMaterialTags
            appearance="history"
            location={record.location}
            linkedMaterialIds={record.linkedMaterialIds}
            nodesById={list.nodesById}
            onOpenMaterial={list.onOpenMaterial}
            trashedNodeIds={list.trashedNodeIds}
          />
        </div>
      </div>
      <AppIconButton
        className="pointer-events-none opacity-0 transition-opacity group-hover/history-row:pointer-events-auto group-hover/history-row:opacity-60 focus-visible:pointer-events-auto focus-visible:opacity-100"
        disabled={list.removingThreadId === record.providerThreadId}
        icon={<Trash2 aria-hidden className="size-3.5" strokeWidth={1.8} />}
        label={t('desktop.rightPanel.assistant.removeThread')}
        onClick={() => list.onRemoveRecord(record)}
      />
      <span
        aria-hidden="true"
        className={`${inspectorListDividerLineClassName} pointer-events-none absolute inset-x-inspector-list-inset bottom-0 h-px group-last/history-row:hidden`}
      />
    </li>
  );
}
