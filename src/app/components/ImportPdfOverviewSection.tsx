import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import { AppListSectionHeader, AppListSurface } from '../../shared/ui';

import { PdfInventoryItem } from './ImportInventoryListItems';

function formatImportTime(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

export function PdfImportsInventorySection({
  inventory,
  nodesById
}: {
  inventory: RuntimePdfImportsInventory | null;
  nodesById?: Record<string, Node>;
}) {
  const t = useTranslation();
  const items = inventory?.items ?? [];
  const description = inventory
    ? t('desktop.importOverview.pdfInventory.description', { count: items.length, time: formatImportTime(inventory.scannedAt) })
    : t('desktop.importOverview.pdfInventory.unavailable');

  return (
    <AppListSurface
      ariaLabel={t('desktop.importOverview.pdfInventory.aria')}
      className="border-0 bg-transparent"
      emptyState={{ description: t('desktop.importOverview.pdfInventory.empty.description'), title: t('desktop.importOverview.pdfInventory.empty.title') }}
      headerSeparated={false}
      header={
        <AppListSectionHeader countLabel={t('desktop.importOverview.count.items', { count: items.length })} description={description} title={t('desktop.importOverview.pdfInventory.title')} />
      }
      isEmpty={items.length === 0}
    >
      <ul className="flex flex-col">
        {items.map((item) => (
          <PdfInventoryItem
            importedAt={formatImportTime(item.lastImportedAt)}
            item={item}
            key={item.sourceFingerprint}
            {...(nodesById ? { nodesById } : {})}
          />
        ))}
      </ul>
    </AppListSurface>
  );
}
