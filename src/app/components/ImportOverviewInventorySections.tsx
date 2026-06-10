import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { AppListSectionHeader, AppListSurface } from '../../shared/ui';

import { ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import { formatImportTime } from './ImportOverviewSections';

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
