import { useMemo, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useFormalImport } from '../hooks/useFormalImport';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import { IMPORT_CATALOG_SORT_OPTIONS, resolveImportLastOpened, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { matchesImportSearch } from './importManagementSearch';
import {
  collectRecentInboxEntries,
  InboxImportedNodeRow,
  InboxRecentRunRow
} from './ImportOverviewSections';

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

const inboxSortOptions = IMPORT_CATALOG_SORT_OPTIONS;
type InboxSortKey = ImportCatalogSortKey;

function formatCountLabel(filteredCount: number, totalCount: number) {
  return filteredCount === totalCount ? String(totalCount) : `${filteredCount} / ${totalCount}`;
}

function useInboxCatalogState(nodesById: Record<string, Node>) {
  const formalImport = useFormalImport();
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<InboxSortKey>('dateSaved');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const filteredRecentRuns = useMemo(
    () => filterRecentRuns(query, nodesById, formalImport.overview.recentRuns),
    [formalImport.overview.recentRuns, nodesById, query]
  );
  const recentNodes = useMemo(() => collectRecentInboxEntries(filteredRecentRuns), [filteredRecentRuns]);
  const visibleItems = useMemo(
    () =>
      sortImportCatalogItems(
        [
          ...recentNodes.map((entry) => ({
            entry,
            key: `linked-${entry.importId}`,
            kind: 'linked' as const,
            sortLastOpened: resolveImportLastOpened(entry.nodeId, nodeViewById),
            sortSaved: entry.importedAt,
            sortTitle: nodesById[entry.nodeId!]?.title ?? entry.sourceName
          })),
          ...filteredRecentRuns.map((entry) => ({
            entry,
            key: `run-${entry.importId}`,
            kind: 'run' as const,
            sortLastOpened: resolveImportLastOpened(entry.nodeId, nodeViewById),
            sortSaved: entry.importedAt,
            sortTitle: entry.nodeId ? nodesById[entry.nodeId]?.title ?? entry.sourceName : entry.sourceName
          }))
        ],
        sortKey,
        sortDirection
      ),
    [filteredRecentRuns, nodeViewById, nodesById, recentNodes, sortDirection, sortKey]
  );

  return {
    countLabel: formatCountLabel(
      visibleItems.length,
      formalImport.overview.recentRuns.length + collectRecentInboxEntries(formalImport.overview.recentRuns).length
    ),
    filteredRecentRuns,
    query,
    recentRunCount: filteredRecentRuns.length,
    setQuery,
    setSortDirection,
    setSortKey,
    sortDirection,
    sortKey,
    totalLinkedNodes: countLinkedNodes(
      filteredRecentRuns.map((entry) => entry.nodeId),
      nodesById
    ),
    visibleItems
  };
}

export function InboxImportLanding({
  nodesById,
  onSelectNode
}: {
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}) {
  const state = useInboxCatalogState(nodesById);

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <ImportCatalogLayout
        countLabel={state.countLabel}
        emptyState={{ description: 'No imported Inbox children or recent runs yet.', title: 'Inbox imports are empty' }}
        hasItems={state.visibleItems.length > 0}
        onChangeQuery={state.setQuery}
        onChangeSortDirection={state.setSortDirection}
        onChangeSortKey={(value) => state.setSortKey(value as InboxSortKey)}
        query={state.query}
        searchLabel="Search inbox imports"
        searchPlaceholder="Search in imports"
        sortDirection={state.sortDirection}
        sortKey={state.sortKey}
        sortOptions={[...inboxSortOptions]}
        title="Inbox"
      >
        {state.visibleItems.map((item) =>
          item.kind === 'linked' ? (
            <InboxImportedNodeRow entry={item.entry} key={item.key} nodesById={nodesById} onOpenNode={onSelectNode} />
          ) : (
            <InboxRecentRunRow entry={item.entry} key={item.key} nodesById={nodesById} onOpenNode={onSelectNode} />
          )
        )}
      </ImportCatalogLayout>
      <p className="sr-only">{state.totalLinkedNodes} linked nodes · {state.recentRunCount} recent runs</p>
    </div>
  );
}
