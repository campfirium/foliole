interface FolderListTextItemProps {
  active?: boolean;
  ariaLabel: string;
  author?: string | null;
  dateLabel: string;
  nodeId: string;
  onClick: () => void;
  summary?: string;
  title: string;
}

export function FolderListTextItem(props: FolderListTextItemProps) {
  return (
    <li>
      <button
        aria-label={props.ariaLabel}
        className={`-mx-4 flex w-[calc(100%+2rem)] flex-col gap-3 rounded-md px-4 py-5 text-left transition-colors focus-visible:outline-none ${
          props.active
            ? 'bg-[var(--app-surface-control-bg)]'
            : 'hover:bg-[var(--app-surface-control-hover-bg)] focus-visible:bg-[var(--app-surface-control-bg)]'
        }`}
        onClick={props.onClick}
        type="button"
      >
        <div className="flex items-start justify-between gap-4">
          <span
            className="line-clamp-2 block min-w-0 flex-1 break-words text-[17px] font-normal leading-7 text-foreground"
            data-testid={`folder-list-title-${props.nodeId}`}
          >
            {props.title}
          </span>
          <span
            className="shrink-0 pt-1 text-[13px] leading-5 text-foreground/56"
            data-testid={`folder-list-date-${props.nodeId}`}
          >
            {props.dateLabel}
          </span>
        </div>
        {props.summary !== undefined ? (
          <span
            className="block min-h-14 line-clamp-2 text-[15px] leading-7 text-foreground/74"
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
      </button>
    </li>
  );
}
