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
import type { NodeViewState } from '../../store/workspaceStore';

import { FolderListTextItem } from './FolderListItemRow';
import { resolveFolderListLocationPath } from './folderListLocationPath';

export type FolderListItemLayout = 'default' | 'virtual-result';

type FolderListItemProps = {
  active?: boolean | undefined;
  itemLayout: FolderListItemLayout;
  node: Node;
  nodeViewState?: NodeViewState;
  onSelectNode: (nodeId: string) => void;
  onSelectNodePath?: (nodeId: string) => void;
  nodesById: Record<string, Node>;
  sortKey: FolderListSortKey;
  draggable?: boolean;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDragStart?: () => void;
  onDrop?: () => void;
};

function renderVirtualResultItem(props: FolderListItemProps & { dateLabel: string; displayTitle: string; locationPath: string }) {
  return (
    <li
      className="list-none border-b border-[var(--workspace-region-main-document-content-divider)]"
      draggable={props.draggable}
      onDragEnd={props.onDragEnd}
      onDragOver={(event) => {
        if (!props.draggable) return;
        event.preventDefault();
        props.onDragOver?.();
      }}
      onDragStart={(event) => {
        if (!props.draggable) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', props.node.id);
        props.onDragStart?.();
      }}
      onDrop={(event) => {
        if (!props.draggable) return;
        event.preventDefault();
        props.onDrop?.();
      }}
    >
      <div className="flex flex-col gap-2 py-5">
        <div className="flex items-start justify-between gap-4">
          <button
            aria-label={`Open ${props.displayTitle}`}
            className="min-w-0 flex-1 text-left text-[17px] font-normal leading-7 text-foreground transition-colors hover:text-accent-strong focus-visible:outline-none"
            onClick={() => props.onSelectNode(props.node.id)}
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
          onClick={() => (props.onSelectNodePath ?? props.onSelectNode)(props.node.id)}
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
      ? getWorkspaceListNodeLastOpenedLabel(props.nodeViewState)
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
      nodeId={props.node.id}
      onClick={() => props.onSelectNode(props.node.id)}
      summary={summary}
      title={displayTitle}
      draggable={props.draggable}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDragStart={props.onDragStart}
      onDrop={props.onDrop}
    />
  );
}
