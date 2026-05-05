import type { NodeViewState } from '../../store/workspaceStore';

import type { ImportCatalogSortOption } from './ImportCatalogSortControls';

export const IMPORT_CATALOG_SORT_OPTIONS: ImportCatalogSortOption[] = [
  { ascLabel: 'Old -> Recent', descLabel: 'Recent -> Old', key: 'dateLastOpened', label: 'Date last opened' },
  { ascLabel: 'Old -> Recent', descLabel: 'Recent -> Old', key: 'dateImported', label: 'Import time' },
  { ascLabel: 'A -> Z', descLabel: 'Z -> A', key: 'title', label: 'Title' }
];

export type ImportCatalogSortKey = 'dateImported' | 'dateLastOpened' | 'dateSaved' | 'title';

type SortableImportItem = {
  sortImported: string;
  sortLastOpened: string | null;
  sortTitle: string;
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareLastOpenedDesc(left: string | null, right: string | null) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return right.localeCompare(left);
}

function compareImportedDesc(left: string, right: string) {
  return right.localeCompare(left);
}

function normalizeImportCatalogSortKey(sortKey: ImportCatalogSortKey) {
  return sortKey === 'dateSaved' ? 'dateImported' : sortKey;
}

export function resolveImportLastOpened(nodeId: string | null | undefined, nodeViewById: Record<string, NodeViewState | undefined>) {
  const updatedAt = nodeId ? nodeViewById[nodeId]?.updatedAt?.trim() : null;
  if (updatedAt && !Number.isNaN(new Date(updatedAt).getTime())) {
    return updatedAt;
  }
  return null;
}

export function sortImportCatalogItems<T extends SortableImportItem>(
  items: T[],
  sortKey: ImportCatalogSortKey,
  sortDirection: 'asc' | 'desc'
) {
  const normalizedSortKey = normalizeImportCatalogSortKey(sortKey);
  const directionMultiplier = sortDirection === 'asc' ? -1 : 1;

  return [...items].sort((left, right) => {
    if (normalizedSortKey === 'title') {
      const titleResult = compareText(left.sortTitle, right.sortTitle) * (sortDirection === 'asc' ? 1 : -1);
      if (titleResult !== 0) {
        return titleResult;
      }
      return compareImportedDesc(left.sortImported, right.sortImported);
    }

    if (normalizedSortKey === 'dateImported') {
      const importedResult = compareImportedDesc(left.sortImported, right.sortImported) * directionMultiplier;
      if (importedResult !== 0) {
        return importedResult;
      }
      return compareText(left.sortTitle, right.sortTitle);
    }

    const lastOpenedResult = compareLastOpenedDesc(left.sortLastOpened, right.sortLastOpened) * directionMultiplier;
    if (lastOpenedResult !== 0) {
      return lastOpenedResult;
    }

    const importedResult = compareImportedDesc(left.sortImported, right.sortImported);
    if (importedResult !== 0) {
      return importedResult;
    }

    return compareText(left.sortTitle, right.sortTitle);
  });
}
