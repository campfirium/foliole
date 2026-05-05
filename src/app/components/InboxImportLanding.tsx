import type { Node } from '../../features/nodes/model/nodeTypes';
import { InspectorSection } from '../../shared/ui';
import { useFormalImport } from '../hooks/useFormalImport';

import { ImportRunSection, InboxImportedNodesSection } from './ImportOverviewSections';

export function InboxImportLanding({
  nodesById,
  onSelectNode
}: {
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}) {
  const formalImport = useFormalImport();

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 justify-center overflow-auto">
      <div className="flex w-full max-w-[min(100%,var(--document-max-width))] flex-col gap-4">
        <InspectorSection
          description="Formal imports land under Inbox first. Review source metadata and recent outcomes here before opening a child node."
          title="Inbox is ready"
        />
        <InboxImportedNodesSection
          entries={formalImport.overview.recentRuns}
          nodesById={nodesById}
          onOpenNode={onSelectNode}
        />
        <ImportRunSection
          emptyLabel="No import result recorded yet."
          entry={formalImport.overview.latestResult}
          title="Latest result"
        />
        <ImportRunSection
          emptyLabel="No failed import recorded."
          entry={formalImport.overview.latestFailure}
          title="Failure entry"
        />
      </div>
    </div>
  );
}
