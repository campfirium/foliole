import { useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  getCachedRuntimeRemovedSources,
  loadRuntimeRemovedSources,
  refreshRuntimeRemovedSources,
  restoreRuntimeRemovedSource,
  subscribeRuntimeRemovedSources,
  type RuntimeRemovedSourceEntry
} from '../../shared/platform/removedSourcesRuntimeRepository';
import { AppEmptyState } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { setSelectedRemovedSource } from './removedSourceSelectionStore';
import { RemovedSourceContextMenu, RemovedSourceRows, RemovedSourcesToolbar } from './RemovedSourcesPanelParts';
import { buildRemovedSourcesTree, getVisibleRemovedSourceRows } from './removedSourcesTree';
import {
  normalizeWorkspaceContentSort,
  resolveDefaultWorkspaceContentSortDirection,
  type WorkspaceContentSortKey,
  type WorkspaceContentSortState
} from './workspaceContentSort';

function useRemovedSources(t: Translate) {
  const snapshot = useSyncExternalStore(
    subscribeRuntimeRemovedSources,
    getCachedRuntimeRemovedSources,
    getCachedRuntimeRemovedSources
  );
  const [errorMessage, setErrorMessage] = useState('');

  async function loadEntries() {
    setErrorMessage('');
    try {
      await refreshRuntimeRemovedSources();
    } catch {
      setErrorMessage(t('desktop.removed.loadFailed'));
    }
  }

  useEffect(() => {
    if (!snapshot.loadedAt) {
      void loadRuntimeRemovedSources().catch(() => setErrorMessage(t('desktop.removed.loadFailed')));
    }
  }, [snapshot.loadedAt, t]);

  return { entries: snapshot.entries, errorMessage, hasLoaded: Boolean(snapshot.loadedAt), loadEntries };
}

function useSelectedRemovedEntry(entries: RuntimeRemovedSourceEntry[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;

  useEffect(() => {
    if (selectedEntry && selectedId !== selectedEntry.id) {
      setSelectedId(selectedEntry.id);
    }
  }, [selectedEntry, selectedId]);

  useEffect(() => {
    setSelectedRemovedSource(selectedEntry);
  }, [selectedEntry]);

  return {
    selectedEntry,
    setSelectedId
  };
}

function useRemovedSort() {
  const [sortState, setSortState] = useState<WorkspaceContentSortState>({ direction: 'desc', key: 'deletedAt' });
  const sort = useMemo(() => normalizeWorkspaceContentSort(sortState, ['deletedAt', 'name']), [sortState]);
  return {
    setSortDirection: (direction: WorkspaceContentSortState['direction']) =>
      setSortState((current) => ({ ...current, direction })),
    setSortKey: (key: WorkspaceContentSortKey) =>
      setSortState((current) => ({
        direction: current.key === key ? current.direction : resolveDefaultWorkspaceContentSortDirection(key),
        key
      })),
    sort
  };
}

function toggleCollapsedNode(nodeId: string, setCollapsedNodeIds: Dispatch<SetStateAction<Set<string>>>) {
  setCollapsedNodeIds((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    return next;
  });
}

function getMenuPosition(event: ReactMouseEvent<HTMLElement>) {
  return {
    left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
    top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
  };
}

function useRemovedSourceContextMenu(args: {
  loadEntries: () => Promise<void>;
  onSelectNode?: (nodeId: string) => void;
  t: Translate;
}) {
  const [contextMenu, setContextMenu] = useState<{ entry: RuntimeRemovedSourceEntry; left: number; top: number } | null>(null);

  function reimportRemovedSource(entry: RuntimeRemovedSourceEntry) {
    setContextMenu(null);
    void restoreRuntimeRemovedSource(entry).then((result) => {
      if (!result || result.status === 'failed') {
        showAppRuntimeNotice(result?.detail?.trim() || args.t('desktop.removed.importFailed'));
        return;
      }
      setSelectedRemovedSource(null);
      void args.loadEntries();
      if (result.node_id) args.onSelectNode?.(result.node_id);
    });
  }

  return { contextMenu, reimportRemovedSource, setContextMenu };
}

function renderRemovedSourcesBody(args: {
  collapsedNodeIds: ReadonlySet<string>;
  errorMessage: string;
  hasLoaded: boolean;
  onOpenContextMenu: (entry: RuntimeRemovedSourceEntry, event: ReactMouseEvent<HTMLElement>) => void;
  onSelect: (entry: RuntimeRemovedSourceEntry) => void;
  onToggleCollapse: (nodeId: string) => void;
  selectedId: string | null;
  t: Translate;
  tree: ReturnType<typeof buildRemovedSourcesTree>;
  visibleRows: ReturnType<typeof getVisibleRemovedSourceRows>;
}) {
  if (args.errorMessage) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
        <AppEmptyState description={args.t('desktop.removed.loadRetry')} title={args.errorMessage} />
      </div>
    );
  }
  if (!args.hasLoaded) {
    return <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2" />;
  }
  return (
    <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2">
      <RemovedSourceRows
        collapsedNodeIds={args.collapsedNodeIds}
        entryByNodeId={args.tree.entryByNodeId}
        onOpenContextMenu={args.onOpenContextMenu}
        onSelect={args.onSelect}
        onToggleCollapse={args.onToggleCollapse}
        rows={args.visibleRows}
        selectedId={args.selectedId}
      />
    </div>
  );
}

export function RemovedSourcesPanel(props: { onSelectNode?: (nodeId: string) => void }) {
  const t = useTranslation();
  const { entries, errorMessage, hasLoaded, loadEntries } = useRemovedSources(t);
  const removedSort = useRemovedSort();
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const contextMenu = useRemovedSourceContextMenu({ loadEntries, t, ...definedProps({ onSelectNode: props.onSelectNode }) });
  const selection = useSelectedRemovedEntry(entries);
  const tree = useMemo(() => buildRemovedSourcesTree(entries, removedSort.sort), [entries, removedSort.sort]);
  const visibleRows = useMemo(() => getVisibleRemovedSourceRows(tree.rows, collapsedNodeIds), [collapsedNodeIds, tree.rows]);
  const hasCollapsedNodes = tree.collapsibleNodeIds.some((nodeId) => collapsedNodeIds.has(nodeId));

  return (
    <aside aria-label={t('desktop.removed.region')} className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <RemovedSourcesToolbar
        hasCollapsibleNodes={tree.collapsibleNodeIds.length > 0}
        hasCollapsedNodes={hasCollapsedNodes}
        loadEntries={loadEntries}
        onChangeSortDirection={removedSort.setSortDirection}
        onChangeSortKey={removedSort.setSortKey}
        onToggleCollapseAll={() => setCollapsedNodeIds(hasCollapsedNodes ? new Set() : new Set(tree.collapsibleNodeIds))}
        sortDirection={removedSort.sort.direction}
        sortKey={removedSort.sort.key}
      />
      {renderRemovedSourcesBody({
        collapsedNodeIds,
        errorMessage,
        hasLoaded,
        onOpenContextMenu: (entry, event) => {
          event.preventDefault();
          contextMenu.setContextMenu({ entry, ...getMenuPosition(event) });
        },
        onSelect: (entry) => selection.setSelectedId(entry.id),
        onToggleCollapse: (nodeId) => toggleCollapsedNode(nodeId, setCollapsedNodeIds),
        selectedId: selection.selectedEntry?.id ?? null,
        t,
        tree,
        visibleRows
      })}
      <RemovedSourceContextMenu
        entry={contextMenu.contextMenu?.entry ?? null}
        left={contextMenu.contextMenu?.left ?? 0}
        onClose={() => contextMenu.setContextMenu(null)}
        onImport={contextMenu.reimportRemovedSource}
        top={contextMenu.contextMenu?.top ?? 0}
      />
    </aside>
  );
}
