import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { readDiveNode } from '../../lib/core/nodes/dive';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import {
  resolveNodeDisplayTitle,
  resolveSystemEntryDisplayName
} from '../shared/localization/systemEntryNames';
import { AppEmptyState } from '../shared/ui';

import { CompanionDirectoryBatchControls, useCompanionDirectoryBatchSelection } from './CompanionDirectoryBatchSelection';
import { CompanionDirectoryConversionMenu } from './CompanionDirectoryConversionMenu';
import {
  type DirectorySection,
  type DirectoryListItem
} from './CompanionDirectoryModel';
import {
  resolveDirectoryRowMeta,
  resolveDirectoryRowSubtitle
} from './CompanionDirectoryVisualModel';
import { CompanionListViewport } from './CompanionListViewport';
import { RecentArticleRow } from './CompanionRecentArticleList';
import { CompanionTopicListMenu } from './CompanionTopicListMenu';
import type { useCompanionExternalDirectory } from './useCompanionExternalDirectory';

type DirectoryRowProps = {
  selecting: boolean;
  checked?: boolean | undefined;
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  item: DirectoryListItem;
  onSelectItem(item: DirectoryListItem): void;
  onStartDive?: ((id: string) => void) | undefined;
  snapshot: WorkspaceSnapshot | null;
};

function DirectoryRow(props: DirectoryRowProps) {
  const { locale, t } = useLocalization();
  const title =
    props.item.source === 'trashRoot'
      ? resolveNodeDisplayTitle(locale, 'special-trash', t(props.item.titleKey))
      : resolveNodeDisplayTitle(locale, props.item.nodeId, props.item.title);
  const subtitle = resolveDirectoryRowSubtitle(props.item, t);
  const meta = resolveDirectoryRowMeta({
    directory: props.directory,
    item: props.item,
    snapshot: props.snapshot
  });
  if (props.item.kind !== 'folder') return <DirectoryTopicRow {...props} title={title} />;
  const dive = props.item.source === 'virtual' ? readDiveNode(props.snapshot?.nodesById[props.item.nodeId]) : null;
  return (
    <div className="flex items-center">
    <button
      aria-pressed={props.checked}
      aria-label={t(
        props.selecting ? 'companion.batch.selectRow' : 'companion.directory.openFolder',
        { title }
      )}
      className="flex min-h-16 min-w-0 flex-1 items-center gap-2.5 border-b border-companion-divider bg-transparent py-3 text-left transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-companion-accent"
      data-testid={`companion-directory-node-${props.item.nodeId}`}
      onClick={() => props.onSelectItem(props.item)}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-medium leading-5 text-foreground/90">
          {title}
        </span>
        {subtitle ? <span className="mt-1 block line-clamp-1 text-[13px] leading-[18px] text-companion-text-tertiary">
          {subtitle}
        </span> : null}
      </span>
      {meta ? (
        <span className="min-w-7 shrink-0 text-right text-[13px] font-medium leading-5 text-companion-text-tertiary">
          {meta}
        </span>
      ) : null}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-companion-text-tertiary"
      />
    </button>
    {!props.selecting && (props.item.source === 'virtual' || props.item.source === 'trash') &&
      <CompanionDirectoryConversionMenu nodeId={props.item.nodeId} title={title}
        onStart={dive && props.onStartDive ? () => props.onStartDive?.(dive.id) : undefined} />}
    {!props.selecting && props.item.source === 'internal' && <CompanionTopicListMenu inline nodeId={props.item.nodeId} title={title}
      metadata={meta ?? ''} directDiveId={props.item.directDiveId} />}
    </div>
  );
}

export function CompanionDirectoryList(props: {
  batchMode?: 'library' | 'trash' | undefined;
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  emptyDescription?: string;
  emptyLabel: string;
  onSelectItem(item: DirectoryListItem): void;
  onStartDive?: ((id: string) => void) | undefined;
  sections: DirectorySection[];
  viewKey?: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const { locale, t } = useLocalization();
  const batch = useCompanionDirectoryBatchSelection(props);
  const controls = <CompanionDirectoryBatchControls batch={batch} />;
  const entries = useMemo(() => flattenDirectorySections(props.sections), [props.sections]);
  if (entries.length === 0) {
    return (
      <div className="px-1 py-6">
        {controls}
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={props.emptyDescription ?? t('companion.directory.emptyDescription')}
          title={props.emptyLabel}
        />
      </div>
    );
  }

  return <>{controls}<CompanionListViewport
    viewKey={props.viewKey ?? 'directory'} items={entries} getItemKey={(entry) => entry.key}
    estimateSize={(index) => entries[index]?.kind === 'header' ? 48 : entries[index]?.item.kind === 'folder' ? 72 : 124}
    renderItem={(entry) => {
      if (entry.kind === 'item') {
        const row = batch.rowSelection(entry.item);
        return <div className="flex min-w-0 items-center">
          {row && <label className="flex h-11 w-11 shrink-0 items-center justify-center">
            <input type="checkbox" className="h-5 w-5 accent-companion-accent" checked={row.checked} disabled={batch.busy} onChange={row.toggle}
              aria-label={t('companion.batch.selectRow', { title: entry.item.title })} />
          </label>}
          <div className="min-w-0 flex-1" inert={batch.active && (!row || batch.busy)}>
            <DirectoryRow directory={props.directory} item={entry.item} selecting={batch.active} checked={row?.checked}
              onSelectItem={batch.active ? () => row?.toggle() : props.onSelectItem}
              onStartDive={props.onStartDive} snapshot={props.snapshot} />
          </div>
        </div>;
      }
      const section = entry.section;
      const title = section.id === 'home' ? resolveSystemEntryDisplayName(locale, 'home')
        : section.id === 'virtual' ? resolveSystemEntryDisplayName(locale, 'virtual-root')
        : section.id === 'trash' ? resolveSystemEntryDisplayName(locale, 'trash')
        : section.titleKey ? t(section.titleKey) : null;
      return <div className={entry.first ? 'pb-2' : 'pb-2 pt-6'}>
        {title ? <h2 className="px-1 text-[12px] font-medium text-companion-text-tertiary">{title}</h2> : null}
      </div>;
    }}
  /></>;
}

type DirectoryEntry = { kind: 'header'; key: string; section: DirectorySection; first: boolean }
  | { kind: 'item'; key: string; item: DirectoryListItem };
function flattenDirectorySections(sections: DirectorySection[]): DirectoryEntry[] {
  return sections.flatMap((section, index): DirectoryEntry[] => [
    ...(section.id !== 'current' ? [{ kind: 'header' as const, key: `section:${section.id}`, section, first: index === 0 }] : []),
    ...section.items.map((item) => ({ kind: 'item' as const, key: item.id, item }))
  ]);
}

function DirectoryTopicRow(props: DirectoryRowProps & { title: string }) {
  const node = props.snapshot?.nodesById[props.item.nodeId];
  const parent = node?.parentNodeId ? props.snapshot?.nodesById[node.parentNodeId] : null;
  return <RecentArticleRow
    article={{
      nodeId: props.item.nodeId,
      title: props.title,
      preview: props.item.preview,
      updatedAt: node?.updatedAt ?? '',
      folderLabel: parent?.kind === 'folder' ? parent.title : null,
      ...('bodyStatus' in props.item && props.item.bodyStatus ? { bodyStatus: props.item.bodyStatus } : {})
    }}
    currentArticleId={null}
    hideMenu={props.selecting}
    checked={props.checked}
    onSelectArticle={() => props.onSelectItem(props.item)}
    testId={`companion-directory-node-${props.item.nodeId}`}
    directDiveId={props.item.source === 'internal' ? props.item.directDiveId : undefined}
  />;
}
