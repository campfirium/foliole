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
    <ol aria-label="Backlinks" className="flex flex-col gap-2">
      {backlinks.map((backlink) => (
        <li key={backlink.sourceNodeId}>
          <button
            className="flex w-full flex-col items-start rounded-md border border-border/70 bg-bg-elevated px-3 py-3 text-left transition-colors hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            onClick={() => onSelectNode(backlink.sourceNodeId)}
            type="button"
          >
            <span className="text-sm font-medium text-foreground">{backlink.sourceTitle}</span>
            <span className="mt-1 text-sm leading-6 text-foreground/68">{backlink.context}</span>
            {backlink.matchCount > 1 ? <span className="mt-2 text-[11px] text-foreground/45">Mentioned {backlink.matchCount} times</span> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}
