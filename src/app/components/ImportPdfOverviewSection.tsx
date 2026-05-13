import type { Node } from '../../features/nodes/model/nodeTypes';
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
  const items = inventory?.items ?? [];
  const description = inventory
    ? `${items.length} pdf files · scanned ${formatImportTime(inventory.scannedAt)}`
    : 'PDF imports inventory is not available yet.';

  return (
    <AppListSurface
      ariaLabel="PDF inventory"
      className="border-0 bg-transparent"
      emptyState={{ description: 'No PDF imports discovered yet.', title: 'PDF inventory is empty' }}
      headerSeparated={false}
      header={
        <AppListSectionHeader countLabel={`${items.length} items`} description={description} title="PDF inventory" />
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
