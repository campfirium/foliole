import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsRuntimeRepository';
import { AppStatusBadge } from '../../shared/ui';

import { ImportCatalogListItem } from './ImportCatalogListItem';
import { renderImportDate, renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import {
  buildImportNodePresentation
} from './importNodePresentation';
export { ReadwiseBookInventoryItem } from './ReadwiseBookInventoryItem';

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

function getPdfOpening(item: RuntimePdfImportsInventory['items'][number]) {
  if (item.nodeStatus === 'generated' && item.pdfIndexStatus === 'ready') {
    return 'Imported node is available and the PDF index is ready.';
  }
  if (item.nodeStatus === 'generated') {
    return 'Imported node is available. The PDF index is still catching up.';
  }
  if (item.nodeStatus === 'deleted') {
    return 'This file was imported before, but the generated node was removed.';
  }
  if (item.pdfIndexStatus === 'failed') {
    return 'The latest import did not finish indexing successfully.';
  }
  return 'This file has been discovered, but no imported node is ready yet.';
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
  const presentation = buildImportNodePresentation({
    fallbackDate: importedAt,
    fallbackOpening: getPdfOpening(item),
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
          <AppStatusBadge label={formatPdfLoadedStatus(item)} tone={resolvePdfLoadedTone(item)} />
          <AppStatusBadge label={formatPdfRetrievalStatus(item)} tone={resolvePdfRetrievalTone(item)} />
        </div>
      }
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(presentation.title)}
      trailing={renderImportDate(presentation.date, 'Date imported')}
    />
  );
}
