import { collectDocumentHighlights } from '../../features/editor/model/documentHighlights';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { InspectorSection } from '../../shared/ui';

interface WorkspaceRightSidebarHighlightsPanelProps {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  onRevealHighlight: (highlightId: string) => void;
}

function EmptyHighlightsState({ description }: { description: string }) {
  return <InspectorSection description={description} title="Highlights" />;
}

export function WorkspaceRightSidebarHighlightsPanel(props: WorkspaceRightSidebarHighlightsPanelProps) {
  if (!props.activeNodeId) {
    return <EmptyHighlightsState description="Select a document to browse its highlights." />;
  }

  const node = props.nodesById[props.activeNodeId];
  if (!node) {
    return null;
  }

  const highlights = collectDocumentHighlights(node.content);
  if (highlights.length === 0) {
    return <EmptyHighlightsState description="This document has no highlights yet." />;
  }

  return (
    <div className="px-1">
      <ol aria-label="Document highlights" className="flex flex-col">
        {highlights.map((highlight) => (
          <li className="border-b border-border/35 last:border-b-0" key={highlight.id}>
            <button
              className="flex w-full flex-col items-start px-1 py-4 text-left transition-colors hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              onClick={() => props.onRevealHighlight(highlight.id)}
              type="button"
            >
              <span className="text-sm leading-7 text-foreground">{highlight.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
