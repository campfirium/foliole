import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { AppEmptyState } from '../../shared/ui';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentWidthResizeHandles } from './DocumentWidthResizeHandles';
import { FolderListToolbarControls } from './FolderListToolbarControls';

function FolderListHeader({
  folderTitle,
  itemCountLabel,
  onChangeSearchQuery,
  onChangeSortDirection,
  onChangeSortKey,
  searchQuery,
  showCountAndTitle,
  sortDirection,
  sortKey
}: {
  folderTitle: string;
  itemCountLabel: string;
  searchQuery: string;
  showCountAndTitle: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  onChangeSearchQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/10 pb-3 max-[900px]:flex-wrap">
      {showCountAndTitle ? (
        <FolderListHeaderSummary
          folderTitle={folderTitle}
          itemCountLabel={itemCountLabel}
          showCountAndTitle={showCountAndTitle}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <FolderListToolbarControls
          onChangeSearchQuery={onChangeSearchQuery}
          onChangeSortDirection={onChangeSortDirection}
          onChangeSortKey={onChangeSortKey}
          searchQuery={searchQuery}
          sortDirection={sortDirection}
          sortKey={sortKey}
        />
      </div>
    </div>
  );
}

function FolderListHeaderSummary({
  folderTitle,
  itemCountLabel,
  showCountAndTitle
}: {
  folderTitle: string;
  itemCountLabel: string;
  showCountAndTitle: boolean;
}) {
  if (!showCountAndTitle) {
    return <div className="min-w-0 flex-1" aria-hidden="true" />;
  }

  return (
    <div className="flex min-w-0 shrink-0 items-baseline gap-2">
      <h2 className="truncate text-base font-semibold text-foreground">{folderTitle}</h2>
      <p
        aria-label={`Folder result count ${itemCountLabel}`}
        className="shrink-0 text-sm font-medium text-foreground/58"
        data-testid="folder-list-count"
      >
        ({itemCountLabel})
      </p>
    </div>
  );
}

function FolderListSurface({
  children,
  documentMaxWidth,
  onResetLayout,
  onStartDocumentResize
}: {
  children: ReactNode;
  documentMaxWidth?: number;
  onResetLayout?: () => void;
  onStartDocumentResize?: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
}) {
  const shouldShowResizeHandles = Boolean(documentMaxWidth && onResetLayout && onStartDocumentResize);
  const style = documentMaxWidth
    ? ({ '--document-max-width': `${documentMaxWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div className="relative flex min-h-0 w-full flex-1" style={style}>
      {children}
      {shouldShowResizeHandles ? (
        <DocumentWidthResizeHandles
          onResetLayout={onResetLayout!}
          onStartDocumentResize={onStartDocumentResize!}
        />
      ) : null}
    </div>
  );
}

function FolderListBody({
  currentEmptyState,
  filteredNodes,
  onRenderItem
}: {
  currentEmptyState: { description: string; title: string };
  filteredNodes: Node[];
  onRenderItem: (node: Node) => ReactNode;
}) {
  if (filteredNodes.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-10">
        <AppEmptyState description={currentEmptyState.description} title={currentEmptyState.title} />
      </div>
    );
  }

  return (
    <ul aria-label="Folder contents" className="flex flex-col divide-y divide-border/10 border-b border-border/10">
      {filteredNodes.map((node) => onRenderItem(node))}
    </ul>
  );
}

export function FolderListViewLayout(props: {
  currentEmptyState: { description: string; title: string };
  documentMaxWidth?: number;
  filteredNodes: Node[];
  folderTitle: string;
  itemCountLabel: string;
  onChangeSearchQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
  onRenderItem: (node: Node) => ReactNode;
  onResetLayout?: () => void;
  onStartDocumentResize?: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  searchQuery: string;
  headerMode: 'full' | 'search-only' | 'hidden';
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  return (
    <FolderListSurface
      documentMaxWidth={props.documentMaxWidth}
      onResetLayout={props.onResetLayout}
      onStartDocumentResize={props.onStartDocumentResize}
    >
      <section aria-label="Folder list body" className="mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        {props.headerMode === 'hidden' ? null : (
          <FolderListHeader
            folderTitle={props.folderTitle}
            itemCountLabel={props.itemCountLabel}
            onChangeSearchQuery={props.onChangeSearchQuery}
            onChangeSortDirection={props.onChangeSortDirection}
            onChangeSortKey={props.onChangeSortKey}
            searchQuery={props.searchQuery}
            showCountAndTitle={props.headerMode === 'full'}
            sortDirection={props.sortDirection}
            sortKey={props.sortKey}
          />
        )}
        <FolderListBody
          currentEmptyState={props.currentEmptyState}
          filteredNodes={props.filteredNodes}
          onRenderItem={props.onRenderItem}
        />
      </section>
    </FolderListSurface>
  );
}
