import type { BacklinkItem } from '../../features/nodes/model/internalLinks';

interface NodeBacklinksListProps {
  backlinks: BacklinkItem[];
  emptyLabel: string;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBacklinksList({ backlinks, emptyLabel, onSelectNode }: NodeBacklinksListProps) {
  if (backlinks.length === 0) {
    return <p className="text-sm text-foreground/60">{emptyLabel}</p>;
  }

  return (
    <ol aria-label="Backlinks" className="flex flex-col gap-1.5">
      {backlinks.map((backlink) => (
        <li key={backlink.sourceNodeId}>
          <button
            className="flex w-full flex-col items-start gap-2 rounded-md bg-transparent px-2 py-2 text-left transition-colors hover:bg-foreground/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
            onClick={() => onSelectNode(backlink.sourceNodeId)}
            type="button"
          >
            <span className="text-[15px] font-semibold text-foreground/92">{backlink.sourceTitle}</span>
            <span className="line-clamp-3 text-sm leading-7 text-foreground/66">{backlink.context}</span>
            {backlink.matchCount > 1 ? <span className="text-[11px] text-foreground/42">Mentioned {backlink.matchCount} times</span> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}
