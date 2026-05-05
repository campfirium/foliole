import { ChevronRight } from 'lucide-react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRootDirectoryView,
  type CompanionFolderListEntry
} from '../shared/platform/companionReadableArticle';

function DirectoryRow(props: {
  item: CompanionFolderListEntry;
  onSelectNode(nodeId: string): void;
}) {
  return (
    <button
      aria-label={`Open ${props.item.kind === 'folder' ? 'folder' : 'topic'} ${props.item.title}`}
      className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-companion-divider px-1 py-4 text-left transition-colors hover:bg-companion-subtle/60"
      onClick={() => props.onSelectNode(props.item.nodeId)}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">{props.item.title}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-companion-text-tertiary" />
    </button>
  );
}

function DirectoryList(props: {
  emptyLabel: string;
  items: CompanionFolderListEntry[];
  onSelectNode(nodeId: string): void;
}) {
  if (props.items.length === 0) {
    return (
      <p className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        {props.emptyLabel}
      </p>
    );
  }

  return (
    <div className="border-t border-companion-divider">
      {props.items.map((item) => (
        <DirectoryRow item={item} key={item.nodeId} onSelectNode={props.onSelectNode} />
      ))}
    </div>
  );
}

export function CompanionDirectoryContent(props: {
  currentNodeId: string | null;
  onSelectNode(nodeId: string): void;
  snapshot: WorkspaceSnapshot | null;
}) {
  const folderView = resolveCompanionFolderViewByNodeId(props.snapshot, props.currentNodeId);
  const rootView = resolveCompanionRootDirectoryView(props.snapshot);
  const items = folderView?.items ?? rootView.items;

  return (
    <section className="px-1 py-4">
      <DirectoryList
        emptyLabel={folderView ? 'This folder is empty' : 'This folder is empty'}
        items={items}
        onSelectNode={props.onSelectNode}
      />
    </section>
  );
}
