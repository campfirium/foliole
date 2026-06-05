import type { Node } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { AppButton, AppStatusBadge } from '../../shared/ui';

import { ImportCatalogListItem } from './ImportCatalogListItem';
import { renderImportDate, renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import { buildImportNodePresentation } from './importNodePresentation';

type ImportInventoryTranslate = ReturnType<typeof useTranslation>;

function formatReadwiseAnnotationStatus(annotationStatus: RuntimeReadwiseBooksInventory['books'][number]['annotationStatus'], t: ImportInventoryTranslate) {
  return annotationStatus === 'has_highlights'
    ? t('desktop.importInventory.readwise.hasHighlights')
    : t('desktop.importInventory.readwise.noHighlights');
}

function formatReadwiseImportStatus(book: RuntimeReadwiseBooksInventory['books'][number], t: ImportInventoryTranslate) {
  if (book.importStatus === 'completed' && book.nodeStatus === 'generated') {
    return t('desktop.importInventory.status.loaded');
  }
  if (book.nodeStatus !== 'generated' && book.generatedNodeId) {
    return t('desktop.importInventory.status.deleted');
  }
  return t('desktop.importInventory.status.notLoaded');
}

function resolveReadwiseAnnotationTone(annotationStatus: RuntimeReadwiseBooksInventory['books'][number]['annotationStatus']) {
  return annotationStatus === 'has_highlights' ? ('success' as const) : ('neutral' as const);
}

function resolveReadwiseImportTone(book: RuntimeReadwiseBooksInventory['books'][number]) {
  if (book.importStatus === 'completed' && book.nodeStatus === 'generated') {
    return 'success' as const;
  }
  if (book.nodeStatus !== 'generated' && book.generatedNodeId) {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

function getReadwiseBookOpening(book: RuntimeReadwiseBooksInventory['books'][number], t: ImportInventoryTranslate) {
  const annotationCopy = book.annotationStatus === 'has_highlights'
    ? t('desktop.importInventory.readwise.highlightsAvailable')
    : t('desktop.importInventory.readwise.noHighlightsFound');
  if (book.importStatus === 'completed' && book.nodeStatus === 'generated') {
    return t('desktop.importInventory.readwise.ready', { annotation: annotationCopy });
  }
  if (book.generatedNodeId && book.nodeStatus !== 'generated') {
    return t('desktop.importInventory.readwise.deleted', { annotation: annotationCopy });
  }
  return t('desktop.importInventory.readwise.notImported', { annotation: annotationCopy });
}

function renderReadwiseBookTitle(input: {
  generatedNodeId: string | null;
  nodeStatus: RuntimeReadwiseBooksInventory['books'][number]['nodeStatus'];
  onOpenBookNode?: (nodeId: string) => void;
  title: string;
}) {
  if (!input.generatedNodeId || input.nodeStatus !== 'generated' || !input.onOpenBookNode) {
    return input.title;
  }
  return (
    <button
      className="text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => input.onOpenBookNode?.(input.generatedNodeId!)}
      type="button"
    >
      {input.title}
    </button>
  );
}

function renderReadwiseBookActions(input: {
  book: RuntimeReadwiseBooksInventory['books'][number];
  generatedNodeId: string | null;
  isResetting: boolean;
  onResetBookImport?: (input: { nodeId: string; title: string }) => void;
  t: ImportInventoryTranslate;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <AppStatusBadge
          label={formatReadwiseAnnotationStatus(input.book.annotationStatus, input.t)}
          tone={resolveReadwiseAnnotationTone(input.book.annotationStatus)}
        />
        <AppStatusBadge label={formatReadwiseImportStatus(input.book, input.t)} tone={resolveReadwiseImportTone(input.book)} />
      </div>
      <AppButton
        disabled={!input.generatedNodeId || input.isResetting}
        onClick={() => input.generatedNodeId && input.onResetBookImport?.({ nodeId: input.generatedNodeId, title: input.book.title })}
        variant="ghost"
      >
        {input.isResetting ? input.t('desktop.importInventory.readwise.importing') : input.t('desktop.importInventory.readwise.import')}
      </AppButton>
    </div>
  );
}

export function ReadwiseBookInventoryItem({
  book,
  nodesById,
  onOpenBookNode,
  onResetBookImport,
  scannedAt,
  resettingNodeId
}: {
  book: RuntimeReadwiseBooksInventory['books'][number];
  nodesById?: Record<string, Node>;
  onOpenBookNode?: (nodeId: string) => void;
  onResetBookImport?: (input: { nodeId: string; title: string }) => void;
  scannedAt: string;
  resettingNodeId?: string | null;
}) {
  const t = useTranslation();
  const generatedNodeId = book.generatedNodeId;
  const isResetting = resettingNodeId === generatedNodeId;
  const presentation = buildImportNodePresentation({
    fallbackDate: scannedAt,
    fallbackOpening: getReadwiseBookOpening(book, t),
    fallbackPath: book.bookKey,
    fallbackTitle: book.title,
    fallbackType: 'book',
    nodeId: generatedNodeId,
    ...definedProps({ nodesById })
  });
  const title = renderReadwiseBookTitle({
    generatedNodeId,
    nodeStatus: book.nodeStatus,
    ...definedProps({ onOpenBookNode }),
    title: presentation.title
  });

  return (
    <ImportCatalogListItem
      actions={renderReadwiseBookActions({
        book,
        generatedNodeId,
        isResetting,
        t,
        ...definedProps({ onResetBookImport })
      })}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(title)}
      trailing={renderImportDate(presentation.date, t('desktop.importOverview.dateImported'))}
    />
  );
}
