import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsBridge';
import { AppStatusBadge, InspectorSection } from '../../shared/ui';

function formatImportTime(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

function formatPdfLoadedStatus(item: RuntimePdfImportsInventory['items'][number]) {
  if (item.nodeStatus === 'generated') {
    return 'Loaded';
  }
  if (item.nodeStatus === 'deleted') {
    return 'Deleted';
  }
  return 'Not loaded';
}

function resolvePdfLoadedTone(item: RuntimePdfImportsInventory['items'][number]) {
  if (item.nodeStatus === 'generated') {
    return 'success' as const;
  }
  if (item.nodeStatus === 'deleted') {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

function formatPdfRetrievalStatus(item: RuntimePdfImportsInventory['items'][number]) {
  if (item.pdfIndexStatus === 'ready') {
    return 'Indexed';
  }
  if (item.pdfIndexStatus === 'indexing' || item.pdfIndexStatus === 'pending') {
    return 'Indexing';
  }
  if (item.pdfIndexStatus === 'failed') {
    return 'Index failed';
  }
  if (item.nodeStatus === 'generated') {
    return 'Pending index';
  }
  return 'Not indexed';
}

function resolvePdfRetrievalTone(item: RuntimePdfImportsInventory['items'][number]) {
  if (item.pdfIndexStatus === 'ready') {
    return 'success' as const;
  }
  if (item.pdfIndexStatus === 'indexing' || item.pdfIndexStatus === 'pending') {
    return 'warning' as const;
  }
  if (item.pdfIndexStatus === 'failed') {
    return 'error' as const;
  }
  if (item.nodeStatus === 'generated') {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

export function PdfImportsInventorySection({ inventory }: { inventory: RuntimePdfImportsInventory | null }) {
  const items = inventory?.items ?? [];
  const description = inventory
    ? `${items.length} pdf files · scanned ${formatImportTime(inventory.scannedAt)}`
    : 'PDF imports inventory is not available yet.';

  return (
    <InspectorSection description={description} title="PDF inventory">
      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div className="rounded-lg border border-border bg-bg-panel px-3 py-3" key={item.sourceFingerprint}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.sourceName}</p>
                <p className="mt-1 break-all text-xs text-foreground/50">{item.sourceLocator}</p>
                <p className="mt-2 text-xs text-foreground/55">Imported {formatImportTime(item.lastImportedAt)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <AppStatusBadge label={formatPdfLoadedStatus(item)} tone={resolvePdfLoadedTone(item)} />
                <AppStatusBadge label={formatPdfRetrievalStatus(item)} tone={resolvePdfRetrievalTone(item)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground/65">No PDF imports discovered yet.</p>
      )}
    </InspectorSection>
  );
}
