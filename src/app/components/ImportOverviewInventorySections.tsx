import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { AppListSectionHeader, AppListSurface } from '../../shared/ui';

import { ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import {
  collectRecentInboxEntries,
  formatImportTime,
  InboxImportedNodeRow,
  InboxRecentRunRow
} from './ImportOverviewSections';

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
  const t = useTranslation();
  const books = inventory?.books ?? [];
  const description = inventory
    ? t('desktop.importOverview.books.description', { count: books.length, time: formatImportTime(inventory.scannedAt) })
    : t('desktop.importOverview.books.unavailable');

  return (
    <AppListSurface
      ariaLabel={t('desktop.importOverview.books.aria')}
      className="border-0 bg-transparent"
      emptyState={{ description: t('desktop.importOverview.books.empty.description'), title: t('desktop.importOverview.books.empty.title') }}
      headerSeparated={false}
      header={
        <AppListSectionHeader countLabel={t('desktop.importOverview.count.items', { count: books.length })} description={description} title={t('desktop.importOverview.books.title')} />
      }
      isEmpty={books.length === 0}
    >
      <ul className="flex flex-col">
        {books.map((book) => (
          <ReadwiseBookInventoryItem
            book={book}
            key={book.bookKey}
            {...(nodesById ? { nodesById } : {})}
            {...(onOpenBookNode ? { onOpenBookNode } : {})}
            {...(onResetBookImport ? { onResetBookImport } : {})}
            scannedAt={formatImportTime(inventory?.scannedAt ?? '')}
            {...(resettingNodeId !== undefined ? { resettingNodeId } : {})}
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
  const t = useTranslation();
  const recentNodes = collectRecentInboxEntries(entries);
  const itemCount = recentNodes.length + entries.length;

  return (
    <AppListSurface
      ariaLabel={t('desktop.importOverview.inbox.aria')}
      className="border-0 bg-transparent"
      emptyState={{ description: t('desktop.importOverview.inbox.empty.description'), title: t('desktop.importOverview.inbox.empty.title') }}
      headerSeparated={false}
      header={
        <AppListSectionHeader
          countLabel={t('desktop.importOverview.count.items', { count: itemCount })}
          description={t('desktop.importOverview.inbox.description')}
          title={t('desktop.importOverview.inbox.title')}
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
