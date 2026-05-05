import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeTextImportResult } from '../../shared/platform/importBridge';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksBridge';
import { AppButton, AppListItem, AppListSectionHeader, AppListSurface, AppStatusBadge } from '../../shared/ui';

import { ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import { renderImportDate, renderImportMeta, renderImportOpening } from './ImportNodeListBits';
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

function collectRecentInboxEntries(entries: RuntimeTextImportResult[]) {
  const seenNodeIds = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.nodeId || seenNodeIds.has(entry.nodeId)) {
      return false;
    }
    seenNodeIds.add(entry.nodeId);
    return true;
  });
}

function renderImportTrailing(date: string, prefix: string, status: RuntimeTextImportResult['resultStatus'], tone: ReturnType<typeof resolveTone>) {
  return (
    <div className="flex flex-col items-end gap-2">
      {renderImportDate(date, prefix)}
      <AppStatusBadge label={status} tone={tone} />
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

function InboxImportedNodeRow({
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
    <AppListItem
      actions={
        <AppButton onClick={() => onOpenNode(entry.nodeId!)} variant="ghost">
          Open node
        </AppButton>
      }
      interactive={false}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={presentation.title}
      trailing={renderImportTrailing(presentation.date, 'Updated', entry.resultStatus, resolveTone(entry))}
    />
  );
}

export function InboxImportedNodesSection({
  entries,
  nodesById,
  onOpenNode
}: {
  entries: RuntimeTextImportResult[];
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  const recentNodes = collectRecentInboxEntries(entries);

  return (
    <AppListSurface
      ariaLabel="Inbox inventory"
      emptyState={{ description: 'No imported Inbox children yet.', title: 'Inbox inventory is empty' }}
      header={
        <AppListSectionHeader
          countLabel={`${recentNodes.length} items`}
          description="Recent imports stay reachable from Inbox before you sort them into the main tree."
          title="Inbox inventory"
        />
      }
      isEmpty={recentNodes.length === 0}
    >
      {recentNodes.length > 0 ? (
        <div className="flex flex-col">
          {recentNodes.map((entry) => (
            <InboxImportedNodeRow entry={entry} key={entry.importId} nodesById={nodesById} onOpenNode={onOpenNode} />
          ))}
        </div>
      ) : null}
    </AppListSurface>
  );
}

function InboxRecentRunRow({
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
    <AppListItem
      actions={
        canOpenNode ? (
          <AppButton onClick={() => onOpenNode(entry.nodeId!)} variant="ghost">
            Open node
          </AppButton>
        ) : undefined
      }
      interactive={false}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={presentation.title}
      trailing={renderImportTrailing(presentation.date, canOpenNode ? 'Updated' : 'Imported', entry.resultStatus, resolveTone(entry))}
    />
  );
}

export function InboxRecentRunsSection({
  entries,
  nodesById,
  onOpenNode
}: {
  entries: RuntimeTextImportResult[];
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  return (
    <AppListSurface
      ariaLabel="Recent import runs"
      emptyState={{ description: 'No import result recorded yet.', title: 'Recent import runs are empty' }}
      header={
        <AppListSectionHeader
          countLabel={`${entries.length} items`}
          description="The latest import outcomes stay visible here, including failures and reused files."
          title="Recent import runs"
        />
      }
      isEmpty={entries.length === 0}
    >
      <div className="flex flex-col">
        {entries.map((entry) => (
          <InboxRecentRunRow entry={entry} key={entry.importId} nodesById={nodesById} onOpenNode={onOpenNode} />
        ))}
      </div>
    </AppListSurface>
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
      emptyState={{ description: 'No books discovered yet.', title: 'Books inventory is empty' }}
      header={
        <AppListSectionHeader countLabel={`${books.length} items`} description={description} title="Books inventory" />
      }
      isEmpty={books.length === 0}
    >
      <div className="flex flex-col">
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
      </div>
    </AppListSurface>
  );
}
