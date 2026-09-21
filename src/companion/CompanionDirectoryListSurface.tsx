import { ChevronRight, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import {
  resolveNodeDisplayTitle,
  resolveSystemEntryDisplayName
} from '../shared/localization/systemEntryNames';
import { AppEmptyState } from '../shared/ui';

import {
  type DirectorySection,
  type DirectoryListItem
} from './CompanionDirectoryModel';
import {
  resolveDirectoryRowMeta,
  resolveDirectoryRowSubtitle
} from './CompanionDirectoryVisualModel';
import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';
import { RecentArticleRow } from './CompanionRecentArticleList';
import type { useCompanionExternalDirectory } from './useCompanionExternalDirectory';

function DirectorySectionGroup(props: { children: ReactNode; title?: string | undefined }) {
  return (
    <section className="space-y-2">
      {props.title ? (
        <h2 className="px-1 text-[12px] font-medium text-companion-text-tertiary">{props.title}</h2>
      ) : null}
      <div className="">{props.children}</div>
    </section>
  );
}

type DirectoryRowProps = {
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  item: DirectoryListItem;
  onSelectItem(item: DirectoryListItem): void;
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
  return (
    <button
      aria-label={t(
        props.item.kind === 'folder'
          ? 'companion.directory.openFolder'
          : 'companion.directory.openTopic',
        { title }
      )}
      className="flex min-h-16 w-full items-center gap-2.5 border-b border-companion-divider bg-transparent py-3 text-left transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-companion-accent"
      data-testid={`companion-directory-node-${props.item.nodeId}`}
      onClick={() => props.onSelectItem(props.item)}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-medium leading-5 text-foreground/90">
          {title}
        </span>
        <span className="mt-1 block line-clamp-1 text-[13px] leading-[18px] text-companion-text-tertiary">
          {subtitle}
        </span>
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
  );
}

export function CompanionDirectoryList(props: {
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  emptyLabel: string;
  onSelectItem(item: DirectoryListItem): void;
  sections: DirectorySection[];
  snapshot: WorkspaceSnapshot | null;
}) {
  const { locale, t } = useLocalization();
  if (props.sections.length === 0) {
    return (
      <div className="px-1 py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.directory.emptyDescription')}
          icon={<CompanionEmptyStateIcon Icon={FolderOpen} />}
          title={props.emptyLabel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {props.sections.map((section) => (
        <DirectorySectionGroup
          key={section.id}
          title={
            section.id === 'home'
              ? resolveSystemEntryDisplayName(locale, 'home')
              : section.id === 'virtual'
              ? resolveSystemEntryDisplayName(locale, 'virtual-root')
              : section.id === 'trash'
                ? resolveSystemEntryDisplayName(locale, 'trash')
                : section.titleKey
                  ? t(section.titleKey)
                  : undefined
          }
        >
          {section.items.map((item) => (
            <DirectoryRow
              directory={props.directory}
              item={item}
              key={item.id}
              onSelectItem={props.onSelectItem}
              snapshot={props.snapshot}
            />
          ))}
        </DirectorySectionGroup>
      ))}
    </div>
  );
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
    onSelectArticle={() => props.onSelectItem(props.item)}
    testId={`companion-directory-node-${props.item.nodeId}`}
  />;
}
