import type { ReactNode, RefObject } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { definedProps } from '../../shared/lib/definedProps';
import type { Translate } from '../../shared/localization/LocalizationProvider';

import { FolderListBody } from './FolderListBody';
import { FolderListHeaderSearchGroup } from './FolderListHeaderSearchGroup';
import { FolderListSortControls } from './FolderListSortControls';

interface FolderListHeaderProps {
  currentViewActions?: ReactNode;
  folderTitle: string;
  itemCountLabel: string;
  t: Translate;
  searchQuery: string;
  searchAction?: ReactNode;
  searchAriaLabel?: string | undefined;
  searchDescription?: string | undefined;
  searchPlaceholder?: string | undefined;
  searchReadOnly?: boolean;
  searchResultLabel: string | null;
  showCountAndTitle: boolean;
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
  onChangeSearchQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
}

function FolderListHeader(props: FolderListHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--workspace-region-main-document-content-divider)] pb-3">
      {props.showCountAndTitle ? (
        <FolderListHeaderSummary
          currentViewActions={props.currentViewActions}
          folderTitle={props.folderTitle}
          itemCountLabel={props.itemCountLabel}
          t={props.t}
        />
      ) : null}
      <div className="ml-auto flex min-w-0 flex-1 flex-nowrap items-center gap-3" data-testid="folder-list-header-controls">
        <FolderListHeaderSearchGroup
          onChangeSearchQuery={props.onChangeSearchQuery}
          {...definedProps({
            searchAction: props.searchAction,
            searchAriaLabel: props.searchAriaLabel,
            searchDescription: props.searchDescription,
            searchPlaceholder: props.searchPlaceholder,
            searchReadOnly: props.searchReadOnly
          })}
          searchQuery={props.searchQuery}
          searchResultLabel={props.searchResultLabel}
        />
        <div className="shrink-0">
          <FolderListSortControls
            onChangeSortDirection={props.onChangeSortDirection}
            onChangeSortKey={props.onChangeSortKey}
            sortDirection={props.sortDirection}
            sortKey={props.sortKey}
          />
        </div>
      </div>
    </div>
  );
}

function FolderListHeaderSummary({
  currentViewActions,
  folderTitle,
  itemCountLabel,
  t
}: {
  currentViewActions?: ReactNode;
  folderTitle: string;
  itemCountLabel: string;
  t: Translate;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <h2 className="truncate text-[13px] font-medium text-foreground">{folderTitle}</h2>
      {currentViewActions ?? (
        <span
          aria-hidden="true"
          className="size-6 shrink-0"
          data-testid="folder-list-action-placeholder"
        />
      )}
      <p
        aria-label={t('desktop.folderList.resultCount', { label: itemCountLabel })}
        className="shrink-0 text-sm font-medium text-foreground/58"
        data-testid="folder-list-count"
      >
        {itemCountLabel}
      </p>
    </div>
  );
}

function FolderListSurface({
  children
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 w-full flex-1">
      {children}
    </div>
  );
}

function renderFolderListHeader(props: Parameters<typeof FolderListViewLayout>[0]) {
  if (props.headerMode === 'hidden') {
    return null;
  }
  return (
    <FolderListHeader
      currentViewActions={props.currentViewActions}
      folderTitle={props.folderTitle}
      itemCountLabel={props.itemCountLabel}
      onChangeSearchQuery={props.onChangeSearchQuery}
      onChangeSortDirection={props.onChangeSortDirection}
      onChangeSortKey={props.onChangeSortKey}
      {...definedProps({
        searchAction: props.searchAction,
        searchAriaLabel: props.searchAriaLabel,
        searchDescription: props.searchDescription,
        searchPlaceholder: props.searchPlaceholder,
        searchReadOnly: props.searchReadOnly
      })}
      searchQuery={props.searchQuery}
      searchResultLabel={props.searchResultLabel}
      showCountAndTitle={props.headerMode === 'full'}
      sortDirection={props.sortDirection}
      sortKey={props.sortKey}
      t={props.t}
    />
  );
}

export function FolderListViewLayout(props: {
  currentViewActions?: ReactNode;
  emptyState?: {
    description: string;
    title: string;
  } | undefined;
  filteredNodes: Node[];
  folderTitle: string;
  itemCountLabel: string;
  t: Translate;
  navigationOverlay?: ReactNode;
  searchResultLabel: string | null;
  searchAction?: ReactNode;
  searchAriaLabel?: string | undefined;
  searchDescription?: string | undefined;
  searchPlaceholder?: string | undefined;
  searchReadOnly?: boolean;
  onChangeSearchQuery: (value: string) => void;
  onChangeSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeSortKey: (sortKey: FolderListSortKey) => void;
  onRenderItem: (node: Node) => ReactNode;
  searchQuery: string;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  headerMode: 'full' | 'search-only' | 'hidden';
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
}) {
  return (
    <FolderListSurface>
      <section aria-label={props.t('desktop.folderList.body')} className="relative mx-auto flex w-full max-w-[var(--document-max-width)] flex-col">
        {props.navigationOverlay}
        {renderFolderListHeader(props)}
        <FolderListBody
          emptyState={props.emptyState}
          filteredNodes={props.filteredNodes}
          onRenderItem={props.onRenderItem}
          scrollElementRef={props.scrollElementRef}
        />
      </section>
    </FolderListSurface>
  );
}
