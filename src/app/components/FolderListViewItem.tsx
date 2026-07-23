import type { MouseEvent as ReactMouseEvent } from 'react';

import type { NodeSelectModifiers } from '../../features/nodes/components/NodeListTreeState';
import type { FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import { projectMarkdownDisplayText } from '../../features/nodes/model/nodeListLabelProjection';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  WORKSPACE_LIST_OPENING_FALLBACK,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeLastOpenedLabel,
  getWorkspaceListNodeOpening
} from '../../features/nodes/model/workspaceListNode';
import { TruncatedTextTooltip } from '../../shared/ui';

import { FolderListTextItem } from './FolderListItemRow';
import { resolveFolderListLocationPath } from './folderListLocationPath';

export type FolderListItemLayout = 'default' | 'virtual-result';

type FolderListItemProps = {
  active?: boolean | undefined;
  isBulkSelectionActive?: boolean;
  itemLayout: FolderListItemLayout;
  node: Node;
  lastOpenedAt?: string | null;
  onSelectNode: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onSelectNodePath?: (nodeId: string) => void;
  nodesById: Record<string, Node>;
  sortKey: FolderListSortKey;
};

function toNodeSelectModifiers(event: ReactMouseEvent) {
  return {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  };
}

function renderVirtualResultItem(props: FolderListItemProps & { dateLabel: string; displayTitle: string; locationPath: string }) {
  const handleLocationClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const modifiers = toNodeSelectModifiers(event);
    if (modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey) {
      props.onSelectNode(props.node.id, modifiers);
      return;
    }
    (props.onSelectNodePath ?? props.onSelectNode)(props.node.id);
  };

  return (
    <li
      className={`list-none border-b border-[var(--workspace-region-main-document-content-divider)] ${
        props.isBulkSelectionActive ? 'bg-[var(--app-surface-control-bg)]' : ''
      }`}
      data-node-bulk-selected={props.isBulkSelectionActive ? 'true' : undefined}
    >
      <div className="flex flex-col gap-2 py-5">
        <div className="flex items-start justify-between gap-4">
          <button
            aria-label={`Open ${props.displayTitle}`}
            className="min-w-0 flex-1 text-left text-[17px] font-normal leading-7 text-foreground transition-colors hover:text-accent-strong focus-visible:outline-none"
            onClick={(event) => props.onSelectNode(props.node.id, toNodeSelectModifiers(event))}
            type="button"
          >
            <TruncatedTextTooltip
              className="line-clamp-2 block break-words"
              data-testid={`folder-list-title-${props.node.id}`}
              text={props.displayTitle}
            >
              {props.displayTitle}
            </TruncatedTextTooltip>
          </button>
          <span
            className="shrink-0 pt-1 text-[13px] leading-5 text-foreground/56"
            data-testid={`folder-list-date-${props.node.id}`}
          >
            {props.dateLabel}
          </span>
        </div>
        <button
          aria-label={`Open real location for ${props.displayTitle}`}
          className="w-fit max-w-full truncate text-left text-[13px] leading-5 text-foreground/56 underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none"
          onClick={handleLocationClick}
          type="button"
        >
          {props.locationPath}
        </button>
      </div>
    </li>
  );
}

export function FolderListViewItem(props: FolderListItemProps) {
  const author = getWorkspaceListNodeAuthor(props.node);
  const opening = getWorkspaceListNodeOpening(props.node);
  const displayTitle = projectMarkdownDisplayText(props.node.title) || props.node.title;
  const summary = opening === WORKSPACE_LIST_OPENING_FALLBACK ? '' : projectMarkdownDisplayText(opening);
  const dateLabel =
    props.sortKey === 'dateLastOpened'
      ? getWorkspaceListNodeLastOpenedLabel({ ...(props.lastOpenedAt === undefined ? {} : { lastOpenedAt: props.lastOpenedAt }) })
      : getWorkspaceListNodeDateLabel(props.node);
  const locationPath = resolveFolderListLocationPath(props.node, props.nodesById);

  if (props.itemLayout === 'virtual-result') {
    return renderVirtualResultItem({ ...props, dateLabel, displayTitle, locationPath });
  }

  return (
    <FolderListTextItem
      active={props.active}
      ariaLabel={`Open ${displayTitle}`}
      author={author}
      dateLabel={dateLabel}
      {...(props.isBulkSelectionActive === undefined ? {} : { isBulkSelectionActive: props.isBulkSelectionActive })}
      nodeId={props.node.id}
      onClick={(event) => props.onSelectNode(props.node.id, toNodeSelectModifiers(event))}
      summary={summary}
      title={displayTitle}
    />
  );
}
