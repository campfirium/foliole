import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import { AppStatusBadge } from '../../shared/ui';

import { ImportCatalogListItem } from './ImportCatalogListItem';
import { renderImportDate, renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import {
  buildImportNodePresentation
} from './importNodePresentation';
export { ReadwiseBookInventoryItem } from './ReadwiseBookInventoryItem';

type ImportInventoryTranslate = ReturnType<typeof useTranslation>;

function formatPdfLoadedStatus(item: RuntimePdfImportsInventory['items'][number], t: ImportInventoryTranslate) {
  if (item.nodeStatus === 'generated') {
    return t('desktop.importInventory.status.loaded');
  }
  if (item.nodeStatus === 'deleted') {
    return t('desktop.importInventory.status.deleted');
  }
  return t('desktop.importInventory.status.notLoaded');
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

function formatPdfRetrievalStatus(item: RuntimePdfImportsInventory['items'][number], t: ImportInventoryTranslate) {
  if (item.pdfIndexStatus === 'ready') {
    return t('desktop.importInventory.status.indexed');
  }
  if (item.pdfIndexStatus === 'indexing' || item.pdfIndexStatus === 'pending') {
    return t('desktop.importInventory.status.indexing');
  }
  if (item.pdfIndexStatus === 'failed') {
    return t('desktop.importInventory.status.indexFailed');
  }
  if (item.nodeStatus === 'generated') {
    return t('desktop.importInventory.status.pendingIndex');
  }
  return t('desktop.importInventory.status.notIndexed');
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

function getPdfOpening(item: RuntimePdfImportsInventory['items'][number], t: ImportInventoryTranslate) {
  if (item.nodeStatus === 'generated' && item.pdfIndexStatus === 'ready') {
    return t('desktop.importInventory.pdf.ready');
  }
  if (item.nodeStatus === 'generated') {
    return t('desktop.importInventory.pdf.catchingUp');
  }
  if (item.nodeStatus === 'deleted') {
    return t('desktop.importInventory.pdf.deleted');
  }
  if (item.pdfIndexStatus === 'failed') {
    return t('desktop.importInventory.pdf.failed');
  }
  return t('desktop.importInventory.pdf.notReady');
}

export function PdfInventoryItem({
  item,
  importedAt,
  nodesById
}: {
  item: RuntimePdfImportsInventory['items'][number];
  importedAt: string;
  nodesById?: Record<string, Node>;
}) {
  const t = useTranslation();
  const presentation = buildImportNodePresentation({
    fallbackDate: importedAt,
    fallbackOpening: getPdfOpening(item, t),
    fallbackPath: item.sourceLocator,
    fallbackTitle: item.sourceName,
    fallbackType: 'pdf',
    nodeId: item.latestNodeId,
    ...(nodesById ? { nodesById } : {})
  });

  return (
    <ImportCatalogListItem
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AppStatusBadge label={formatPdfLoadedStatus(item, t)} tone={resolvePdfLoadedTone(item)} />
          <AppStatusBadge label={formatPdfRetrievalStatus(item, t)} tone={resolvePdfRetrievalTone(item)} />
        </div>
      }
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(presentation.title)}
      trailing={renderImportDate(presentation.date, t('desktop.importOverview.dateImported'))}
    />
  );
}
