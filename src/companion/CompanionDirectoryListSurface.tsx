import { ChevronRight, FileText, Folder, FolderOpen, Inbox, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState } from '../shared/ui';

import { type DirectorySection, type DirectoryListItem, INBOX_NODE_ID } from './CompanionDirectoryModel';
import { resolveDirectoryRowMeta, resolveDirectoryRowSubtitle } from './CompanionDirectoryVisualModel';
import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';
import type { useCompanionExternalDirectory } from './useCompanionExternalDirectory';

function resolveDirectoryRowIcon(item: DirectoryListItem): { Icon: LucideIcon; isAccent: boolean } {
  if (item.source === 'trashRoot' || item.source === 'trash') {
    return { Icon: item.kind === 'folder' ? Folder : Trash2, isAccent: false };
  }
  if (item.source === 'virtual') return { Icon: Sparkles, isAccent: false };
  if (item.source === 'externalFolder' || item.source === 'externalDirectory') {
    return { Icon: FolderOpen, isAccent: false };
  }
  if (item.source === 'externalDocument') return { Icon: FileText, isAccent: false };
  if (item.nodeId === INBOX_NODE_ID) return { Icon: Inbox, isAccent: true };
  return { Icon: item.kind === 'folder' ? Folder : FileText, isAccent: false };
}

function DirectorySectionGroup(props: { children: ReactNode; title?: string | undefined }) {
  return (
    <section className="space-y-1">
      {props.title ? (
        <h2 className="px-1 text-[12px] font-semibold text-companion-text-tertiary">{props.title}</h2>
      ) : null}
      <div className="divide-y divide-companion-divider">{props.children}</div>
    </section>
  );
}

function DirectoryRow(props: {
  directory: ReturnType<typeof useCompanionExternalDirectory>;
  item: DirectoryListItem;
  onSelectItem(item: DirectoryListItem): void;
  snapshot: WorkspaceSnapshot | null;
}) {
  const t = useTranslation();
  const title = props.item.source === 'trashRoot' ? t(props.item.titleKey) : props.item.title;
  const { Icon, isAccent } = resolveDirectoryRowIcon(props.item);
  const subtitle = resolveDirectoryRowSubtitle(props.item, t);
  const meta = resolveDirectoryRowMeta({ directory: props.directory, item: props.item, snapshot: props.snapshot });
  return (
    <button
      aria-label={t(props.item.kind === 'folder' ? 'companion.directory.openFolder' : 'companion.directory.openTopic', { title })}
      className="flex min-h-16 w-full items-center gap-3 bg-transparent px-1 py-2 text-left transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-companion-accent active:bg-companion-subtle/70"
      onClick={() => props.onSelectItem(props.item)}
      type="button"
    >
      <span
        className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] ${
          isAccent ? 'bg-companion-accent-soft text-companion-accent' : 'bg-companion-subtle/55 text-companion-text-secondary'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-5 text-foreground/85">{title}</span>
        <span className="mt-1 block line-clamp-1 text-[13px] leading-[18px] text-companion-text-tertiary">{subtitle}</span>
      </span>
      {meta ? (
        <span className="min-w-8 shrink-0 text-right text-[13.5px] font-semibold leading-5 text-companion-text-tertiary">
          {meta}
        </span>
      ) : null}
      <ChevronRight className={`h-5 w-5 shrink-0 ${isAccent ? 'text-companion-accent' : 'text-companion-text-tertiary'}`} />
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
  const t = useTranslation();
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
        <DirectorySectionGroup key={section.id} title={section.titleKey ? t(section.titleKey) : undefined}>
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
