import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { AppButton, AppListSectionHeader, AppListSurface, AppStatusBadge } from '../../shared/ui';

import { ImportCatalogListItem } from './ImportCatalogListItem';
import { ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import { renderImportDate, renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import {
  buildImportNodePresentation
} from './importNodePresentation';

function formatImportTime(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

function formatImportOutcome(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return `Failed ${entry.sourceName}`;
  }
  if (entry.resultStatus === 'degraded') {
    return `Degraded ${entry.sourceName}`;
  }
  if (entry.duplicateSemantic === 'duplicate') {
    return `Reused ${entry.sourceName}`;
  }
  if (entry.duplicateSemantic === 'updated') {
    return `Updated ${entry.sourceName}`;
  }
  return `Imported ${entry.sourceName}`;
}

function resolveTone(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return 'error' as const;
  }
  if (entry.resultStatus === 'degraded') {
    return 'warning' as const;
  }
  return 'info' as const;
}

function resolveDetail(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return entry.failureReason ?? 'Unknown import failure';
  }
  if (entry.resultStatus === 'degraded') {
    return entry.degradedReason ?? 'Import degraded';
  }
  return `${entry.sourceKind} · ${entry.sourceLocator}`;
}

export function collectRecentInboxEntries(entries: RuntimeTextImportResult[]) {
  const seenNodeIds = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.nodeId || seenNodeIds.has(entry.nodeId)) {
      return false;
    }
    seenNodeIds.add(entry.nodeId);
    return true;
  });
}

function renderImportActions(input: {
  canOpenNode?: boolean;
  nodeId?: string | null;
  onOpenNode: (nodeId: string) => void;
  status: RuntimeTextImportResult['resultStatus'];
  tone: ReturnType<typeof resolveTone>;
}) {
  const openNodeId = input.canOpenNode ? (input.nodeId ?? null) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <AppStatusBadge label={input.status} tone={input.tone} />
      </div>
      {openNodeId ? (
        <AppButton onClick={() => input.onOpenNode(openNodeId)} variant="ghost">
          Open topic
        </AppButton>
      ) : null}
    </div>
  );
}

function buildRunPresentation(entry: RuntimeTextImportResult, nodesById: Record<string, Node>) {
  return buildImportNodePresentation({
    fallbackDate: formatImportTime(entry.importedAt),
    fallbackOpening: resolveDetail(entry),
    fallbackPath: entry.sourceLocator,
    fallbackTitle: entry.resultStatus === 'failed' ? formatImportOutcome(entry) : entry.sourceName,
    fallbackType: entry.sourceKind,
    nodeId: entry.nodeId,
    nodesById
  });
}

export function InboxImportedNodeRow({
  entry,
  nodesById,
  onOpenNode
}: {
  entry: RuntimeTextImportResult;
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  if (!entry.nodeId || !nodesById[entry.nodeId]) {
    return null;
  }

  const presentation = buildRunPresentation(entry, nodesById);

  return (
    <ImportCatalogListItem
      actions={renderImportActions({ canOpenNode: true, nodeId: entry.nodeId, onOpenNode, status: entry.resultStatus, tone: resolveTone(entry) })}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(presentation.title)}
      trailing={renderImportDate(presentation.date, 'Date imported')}
    />
  );
}

export function InboxRecentRunRow({
  entry,
  nodesById,
  onOpenNode
}: {
  entry: RuntimeTextImportResult;
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  const canOpenNode = Boolean(entry.nodeId && nodesById[entry.nodeId]);
  const presentation = buildRunPresentation(entry, nodesById);

  return (
    <ImportCatalogListItem
      actions={renderImportActions({ canOpenNode, nodeId: entry.nodeId, onOpenNode, status: entry.resultStatus, tone: resolveTone(entry) })}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(presentation.title)}
      trailing={renderImportDate(presentation.date, 'Date imported')}
    />
  );
}

export function ReadwiseBooksInventorySection({
  inventory,
  nodesById,
  onOpenBookNode,
  onResetBookImport,
  resettingNodeId
}: {
  inventory: RuntimeReadwiseBooksInventory | null;
  nodesById?: Record<string, Node>;
  onOpenBookNode?: (nodeId: string) => void;
  onResetBookImport?: (input: { nodeId: string; title: string }) => void;
  resettingNodeId?: string | null;
}) {
  const books = inventory?.books ?? [];
  const description = inventory
    ? `${books.length} books · scanned ${formatImportTime(inventory.scannedAt)}`
    : 'Shared books list is not available yet.';

  return (
    <AppListSurface
      ariaLabel="Books inventory"
      className="border-0 bg-transparent"
      emptyState={{ description: 'No books discovered yet.', title: 'Books inventory is empty' }}
      headerSeparated={false}
      header={
        <AppListSectionHeader countLabel={`${books.length} items`} description={description} title="Books inventory" />
      }
      isEmpty={books.length === 0}
    >
      <ul className="flex flex-col">
        {books.map((book) => (
          <ReadwiseBookInventoryItem
            book={book}
            key={book.bookKey}
            nodesById={nodesById}
            onOpenBookNode={onOpenBookNode}
            onResetBookImport={onResetBookImport}
            scannedAt={formatImportTime(inventory?.scannedAt ?? '')}
            resettingNodeId={resettingNodeId}
          />
        ))}
      </ul>
    </AppListSurface>
  );
}

export function InboxImportsSection({
  entries,
  nodesById,
  onOpenNode
}: {
  entries: RuntimeTextImportResult[];
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  const recentNodes = collectRecentInboxEntries(entries);
  const itemCount = recentNodes.length + entries.length;

  return (
    <AppListSurface
      ariaLabel="Inbox imports list"
      className="border-0 bg-transparent"
      emptyState={{ description: 'No imported Inbox topics or recent runs yet.', title: 'Inbox imports are empty' }}
      headerSeparated={false}
      header={
        <AppListSectionHeader
          countLabel={`${itemCount} items`}
          description="Imported topics and recent outcomes stay together here so the latest inbox activity reads as one continuous list."
          title="Inbox imports"
        />
      }
      isEmpty={itemCount === 0}
    >
      <ul className="flex flex-col gap-3 px-1 py-1">
        {recentNodes.map((entry) => (
          <InboxImportedNodeRow entry={entry} key={`linked-${entry.importId}`} nodesById={nodesById} onOpenNode={onOpenNode} />
        ))}
        {entries.map((entry) => (
          <InboxRecentRunRow entry={entry} key={`run-${entry.importId}`} nodesById={nodesById} onOpenNode={onOpenNode} />
        ))}
      </ul>
    </AppListSurface>
  );
}
