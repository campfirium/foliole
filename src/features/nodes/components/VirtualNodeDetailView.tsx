import { useEffect, useMemo, useState } from 'react';

import { FolderListView } from '../../../app/components/FolderListView';
import type { Node } from '../model/nodeTypes';
import { getVirtualNodeResultNodes } from '../model/virtualNodeDetail';

interface VirtualNodeDetailViewProps {
  node: Node;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  onUpdateFilter: (nodeId: string, value: string) => void;
}

function getEmptyStateCopy(hasSavedFilter: boolean) {
  if (!hasSavedFilter) {
    return {
      description: 'Save one keyword first. Matching articles will appear here after you run the filter.',
      title: 'No saved filter yet'
    };
  }

  return {
    description: 'No articles match the saved keyword right now. Try a different keyword and run it again.',
    title: 'No matching articles yet'
  };
}

export function VirtualNodeDetailView({ node, nodesById, onSelectNode, onUpdateFilter }: VirtualNodeDetailViewProps) {
  const [draftFilter, setDraftFilter] = useState(node.content);

  useEffect(() => {
    setDraftFilter(node.content);
  }, [node.content, node.id]);

  const savedFilter = node.content.trim();
  const resultNodes = useMemo(() => getVirtualNodeResultNodes(node.id, nodesById, savedFilter), [node.id, nodesById, savedFilter]);

  return (
    <section aria-label="Virtual node details" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 max-[1080px]:px-2 max-[1080px]:py-2">
      <div className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col gap-4">
        <section className="rounded-[var(--radius-3)] border border-border bg-bg-panel px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Saved filter</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/68">
                Save one simple keyword here. The result area below reuses the same list view as folders.
              </p>
            </div>
            <button
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => onUpdateFilter(node.id, draftFilter)}
              type="button"
            >
              Save and run
            </button>
          </div>
          <label className="mt-4 block text-sm font-medium text-foreground" htmlFor={`virtual-node-filter-${node.id}`}>
            Keyword
          </label>
          <textarea
            className="mt-2 min-h-24 w-full rounded-[var(--radius-2)] border border-border bg-bg px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/35 focus:border-border-strong"
            id={`virtual-node-filter-${node.id}`}
            onChange={(event) => setDraftFilter(event.target.value)}
            placeholder="For now, save one keyword to match article titles or body text."
            value={draftFilter}
          />
          <p className="mt-2 text-xs leading-5 text-foreground/56">
            Saved value: {savedFilter ? `“${savedFilter}”` : 'none'}
          </p>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="px-1 pb-1">
            <h2 className="text-sm font-semibold text-foreground">Results</h2>
            <p className="mt-1 text-sm leading-6 text-foreground/68">
              Click any result to open the original article node.
            </p>
          </div>
          <FolderListView
            emptyState={getEmptyStateCopy(Boolean(savedFilter))}
            nodes={resultNodes}
            nodesById={nodesById}
            onSelectNode={onSelectNode}
            regionLabel="Folder list view"
          />
        </section>
      </div>
    </section>
  );
}
