import { ArrowDownLeft } from 'lucide-react';
import { useState } from 'react';

import type { BacklinkItem } from '../../features/nodes/model/internalLinks';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../shared/ui';

import { NodeBacklinksList } from './NodeBacklinksList';

interface DocumentPanelHeaderBacklinksMenuProps {
  backlinks: BacklinkItem[];
  onSelectNode: (nodeId: string) => void;
}

export function DocumentPanelHeaderBacklinksMenu(props: DocumentPanelHeaderBacklinksMenuProps) {
  const [open, setOpen] = useState(false);

  if (props.backlinks.length === 0) {
    return null;
  }

  return (
    <AppDropdownMenu onOpenChange={setOpen} open={open}>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={`Open link references (${props.backlinks.length})`}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[max(var(--radius-1),var(--radius-full))] border border-transparent bg-transparent px-1.5 text-sm font-normal leading-none text-foreground/58 transition-colors hover:bg-foreground/[0.03] hover:text-foreground/78 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.04] data-[state=open]:text-foreground/82"
          type="button"
        >
          <ArrowDownLeft aria-hidden="true" size={15} strokeWidth={1.75} />
          <span className="min-w-3 text-left text-[13px] tabular-nums text-current">{props.backlinks.length}</span>
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        align="start"
        className="w-[min(36rem,calc(100vw-3rem))] border-transparent bg-bg-elevated p-0 shadow-none"
        sideOffset={8}
      >
        <section aria-label="Link references" className="flex max-h-[min(70vh,42rem)] min-h-0 flex-col">
          <div className="px-4 pb-1 pt-3 text-[12px] font-medium tracking-[0.01em] text-foreground/48">
            Link references
          </div>
          <div className="min-h-0 overflow-y-auto px-4 pb-3 pt-1">
            <NodeBacklinksList
              backlinks={props.backlinks}
              emptyLabel="No notes link back to this note yet."
              onSelectNode={(nodeId) => {
                setOpen(false);
                props.onSelectNode(nodeId);
              }}
            />
          </div>
        </section>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
