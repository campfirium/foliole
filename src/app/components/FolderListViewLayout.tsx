import { Search, X } from 'lucide-react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { AppEmptyState, AppInput } from '../../shared/ui';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentWidthResizeHandles } from './DocumentWidthResizeHandles';
import { FolderListSortControls } from './FolderListSortControls';

function FolderListHeader({
  folderTitle,
  itemCountLabel,
  onChangeSearchQuery,
  onChangeSortDirection,
  onChangeSortKey,
  searchQuery,
  searchResultLabel,
  showCountAndTitle,
  sortDirection,
  sortKey
}: {
  folderTitle: string;
  itemCountLabel: string;
  searchQuery: string;
  searchResultLabel: string | null;
  showCountAndTitle: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  onChangeSearchQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/10 pb-3">
      {showCountAndTitle ? <FolderListHeaderSummary folderTitle={folderTitle} itemCountLabel={itemCountLabel} /> : null}
      <div className="w-[248px] max-w-full max-[900px]:w-full max-[900px]:basis-full">
        <FolderListSearchBox
          onChangeSearchQuery={onChangeSearchQuery}
          searchQuery={searchQuery}
          searchResultLabel={searchResultLabel}
        />
      </div>
      <div className="ml-auto shrink-0">
        <FolderListSortControls
          onChangeSortDirection={onChangeSortDirection}
          onChangeSortKey={onChangeSortKey}
          sortDirection={sortDirection}
          sortKey={sortKey}
        />
      </div>
    </div>
  );
}

function FolderListSearchBox({
  onChangeSearchQuery,
  searchQuery,
  searchResultLabel
}: {
  searchQuery: string;
  searchResultLabel: string | null;
  onChangeSearchQuery: (value: string) => void;
}) {
  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-transparent bg-bg-subtle/70 px-3 transition-colors hover:border-border/10 hover:bg-bg-subtle focus-within:border-border/20 focus-within:bg-bg-subtle">
      <Search aria-hidden="true" className="shrink-0 text-foreground/38" size={14} strokeWidth={1.8} />
      <AppInput
        aria-label="Search folder contents"
        className="h-8 min-w-0 appearance-none !border-0 !bg-transparent px-0 text-sm shadow-none placeholder:text-foreground/38 hover:!bg-transparent focus-visible:!bg-transparent focus-visible:!ring-0 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => onChangeSearchQuery(event.target.value)}
        placeholder="Search in this folder"
        type="search"
        value={searchQuery}
      />
      {searchResultLabel ? <FolderListSearchResultLabel searchResultLabel={searchResultLabel} /> : null}
      {searchQuery ? <FolderListSearchClearButton onClear={() => onChangeSearchQuery('')} /> : null}
    </div>
  );
}

function FolderListSearchResultLabel({ searchResultLabel }: { searchResultLabel: string }) {
  return (
    <span
      aria-label={`Folder search results ${searchResultLabel}`}
      className="min-w-[4.5rem] shrink-0 text-right text-xs font-medium tabular-nums text-foreground/46"
    >
      {searchResultLabel}
    </span>
  );
}

function FolderListSearchClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      aria-label="Clear folder search"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground/46 transition-colors hover:bg-foreground/8 hover:text-foreground/68 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onClear}
      type="button"
    >
      <X aria-hidden="true" size={14} strokeWidth={2.2} />
    </button>
  );
}

function FolderListHeaderSummary({
  folderTitle,
  itemCountLabel
}: {
  folderTitle: string;
  itemCountLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <h2 className="truncate text-[13px] font-medium text-foreground">{folderTitle}</h2>
      <p
        aria-label={`Folder result count ${itemCountLabel}`}
        className="shrink-0 text-sm font-medium text-foreground/58"
        data-testid="folder-list-count"
      >
        {itemCountLabel}
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
  searchResultLabel: string | null;
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
            searchResultLabel={props.searchResultLabel}
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
