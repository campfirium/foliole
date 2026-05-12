import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';
import { AppButton, AppStatusBadge } from '../../shared/ui';

import { ImportCatalogListItem } from './ImportCatalogListItem';
import { renderImportDate, renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import { buildImportNodePresentation } from './importNodePresentation';

function formatReadwiseAnnotationStatus(annotationStatus: RuntimeReadwiseBooksInventory['books'][number]['annotationStatus']) {
  return annotationStatus === 'has_highlights' ? 'Has highlights' : 'No highlights';
}

function formatReadwiseImportStatus(book: RuntimeReadwiseBooksInventory['books'][number]) {
  if (book.importStatus === 'completed' && book.nodeStatus === 'generated') {
    return 'Loaded';
  }
  if (book.nodeStatus !== 'generated' && book.generatedNodeId) {
    return 'Deleted';
  }
  return 'Not loaded';
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

function getReadwiseBookOpening(book: RuntimeReadwiseBooksInventory['books'][number]) {
  const annotationCopy = book.annotationStatus === 'has_highlights' ? 'Highlights available.' : 'No highlights found yet.';
  if (book.importStatus === 'completed' && book.nodeStatus === 'generated') {
    return `${annotationCopy} Imported node is ready to open.`;
  }
  if (book.generatedNodeId && book.nodeStatus !== 'generated') {
    return `${annotationCopy} The previously imported node is no longer available.`;
  }
  return `${annotationCopy} This book has not been imported into a node yet.`;
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
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <AppStatusBadge
          label={formatReadwiseAnnotationStatus(input.book.annotationStatus)}
          tone={resolveReadwiseAnnotationTone(input.book.annotationStatus)}
        />
        <AppStatusBadge label={formatReadwiseImportStatus(input.book)} tone={resolveReadwiseImportTone(input.book)} />
      </div>
      <AppButton
        disabled={!input.generatedNodeId || input.isResetting}
        onClick={() => input.generatedNodeId && input.onResetBookImport?.({ nodeId: input.generatedNodeId, title: input.book.title })}
        variant="ghost"
      >
        {input.isResetting ? 'Importing…' : 'Import'}
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
  const generatedNodeId = book.generatedNodeId;
  const isResetting = resettingNodeId === generatedNodeId;
  const presentation = buildImportNodePresentation({
    fallbackDate: scannedAt,
    fallbackOpening: getReadwiseBookOpening(book),
    fallbackPath: book.bookKey,
    fallbackTitle: book.title,
    fallbackType: 'book',
    nodeId: generatedNodeId,
    nodesById
  });
  const title = renderReadwiseBookTitle({
    generatedNodeId,
    nodeStatus: book.nodeStatus,
    onOpenBookNode,
    title: presentation.title
  });

  return (
    <ImportCatalogListItem
      actions={renderReadwiseBookActions({
        book,
        generatedNodeId,
        isResetting,
        onResetBookImport
      })}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(title)}
      trailing={renderImportDate(presentation.date, 'Date imported')}
    />
  );
}
