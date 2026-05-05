import { useMemo, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useFormalImport } from '../hooks/useFormalImport';

import { matchesImportSearch } from './importManagementSearch';
import { ImportManagementSearchBar } from './ImportManagementSearchBar';
import { InboxImportedNodesSection, InboxRecentRunsSection } from './ImportOverviewSections';

function countLinkedNodes(nodeIds: Array<string | null>, nodesById: Record<string, Node>) {
  const linkedNodeIds = new Set<string>();
  nodeIds.forEach((nodeId) => {
    if (nodeId && nodesById[nodeId]) {
      linkedNodeIds.add(nodeId);
    }
  });
  return linkedNodeIds.size;
}

function filterRecentRuns(query: string, nodesById: Record<string, Node>, runs: ReturnType<typeof useFormalImport>['overview']['recentRuns']) {
  return runs.filter((entry) =>
    matchesImportSearch(query, [
      entry.sourceKind,
      entry.sourceLocator,
      entry.sourceName,
      entry.resultStatus,
      entry.failureReason,
      entry.nodeId ? nodesById[entry.nodeId]?.title : null
    ])
  );
}

function InboxImportsHeader({
  onChangeQuery,
  query,
  recentRunCount,
  importedNodeCount
}: {
  onChangeQuery: (value: string) => void;
  query: string;
  recentRunCount: number;
  importedNodeCount: number;
}) {
  return (
    <section aria-label="Inbox imports overview" className="border-b border-border/70 px-1 pb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/52">Import management</p>
      <h1 className="mt-2 text-lg font-semibold text-foreground">Inbox imports</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/68">
        Review imported files, source paths, and recent outcomes here before moving content deeper into the workspace.
      </p>
      <p className="mt-3 text-xs text-foreground/56">{importedNodeCount} linked nodes · {recentRunCount} recent runs</p>
      <div className="mt-4">
        <ImportManagementSearchBar
          countLabel={`${recentRunCount} matches`}
          onChange={onChangeQuery}
          placeholder="Search inbox imports"
          value={query}
        />
      </div>
    </section>
  );
}

export function InboxImportLanding({
  nodesById,
  onSelectNode
}: {
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}) {
  const formalImport = useFormalImport();
  const [query, setQuery] = useState('');
  const filteredRecentRuns = useMemo(
    () => filterRecentRuns(query, nodesById, formalImport.overview.recentRuns),
    [formalImport.overview.recentRuns, nodesById, query]
  );
  const importedNodeCount = countLinkedNodes(
    filteredRecentRuns.map((entry) => entry.nodeId),
    nodesById
  );
  const recentRunCount = filteredRecentRuns.length;

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 justify-center overflow-auto">
      <div className="flex w-full max-w-[min(100%,var(--document-max-width))] flex-col gap-4">
        <InboxImportsHeader importedNodeCount={importedNodeCount} onChangeQuery={setQuery} query={query} recentRunCount={recentRunCount} />
        <InboxImportedNodesSection
          entries={filteredRecentRuns}
          nodesById={nodesById}
          onOpenNode={onSelectNode}
        />
        <InboxRecentRunsSection
          entries={filteredRecentRuns}
          nodesById={nodesById}
          onOpenNode={onSelectNode}
        />
      </div>
    </div>
  );
}
