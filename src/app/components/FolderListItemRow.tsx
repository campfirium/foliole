import type { MouseEvent as ReactMouseEvent } from 'react';

import { TruncatedTextTooltip } from '../../shared/ui';

interface FolderListTextItemProps {
  active?: boolean | undefined;
  ariaLabel: string;
  author?: string | null;
  dateLabel: string;
  isBulkSelectionActive?: boolean;
  nodeId: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  summary?: string;
  title: string;
}

export function FolderListTextItem(props: FolderListTextItemProps) {
  return (
    <li className="list-none border-b border-[var(--workspace-region-main-document-content-divider)]">
      <button
        aria-label={props.ariaLabel}
        data-node-bulk-selected={props.isBulkSelectionActive ? 'true' : undefined}
        className={`-mx-4 flex h-[188px] w-[calc(100%+2rem)] flex-col gap-3 overflow-hidden rounded-md px-4 py-5 text-left transition-colors focus-visible:outline-none ${
          props.active || props.isBulkSelectionActive
            ? 'bg-[var(--app-surface-control-bg)]'
            : 'hover:bg-[var(--app-surface-control-hover-bg)] focus-visible:bg-[var(--app-surface-control-bg)]'
        }`}
        onClick={props.onClick}
        type="button"
      >
        <FolderListTextItemBody {...props} />
      </button>
    </li>
  );
}

function FolderListTextItemBody(props: FolderListTextItemProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <TruncatedTextTooltip
          className="block min-w-0 flex-1 truncate text-[17px] font-normal leading-7 text-foreground"
          data-testid={`folder-list-title-${props.nodeId}`}
          text={props.title}
        >
          {props.title}
        </TruncatedTextTooltip>
        <span
          className="shrink-0 pt-1 text-[13px] leading-5 text-foreground/56"
          data-testid={`folder-list-date-${props.nodeId}`}
        >
          {props.dateLabel}
        </span>
      </div>
      {props.summary !== undefined ? (
        <span
          className="line-clamp-4 block h-28 text-[15px] leading-7 text-foreground/74"
          data-testid={`folder-list-excerpt-${props.nodeId}`}
        >
          {props.summary}
        </span>
      ) : null}
      {props.author ? (
        <span
          className="block min-h-5 min-w-0 truncate text-[13px] leading-5 text-foreground/56"
          data-testid={`folder-list-meta-${props.nodeId}`}
        >
          {props.author}
        </span>
      ) : null}
    </>
  );
}
