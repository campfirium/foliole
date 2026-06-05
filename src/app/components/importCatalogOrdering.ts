import { parseLiteralUnion } from '../../shared/lib/parseLiteralUnion';
import type { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { NodeViewState } from '../../store/workspaceStore';

import type { ImportCatalogSortOption } from './ImportCatalogSortControls';

export const IMPORT_CATALOG_SORT_OPTIONS: ImportCatalogSortOption[] = [
  { ascLabel: 'Older -> Recent', descLabel: 'Recent -> Older', key: 'dateLastOpened', label: 'Last opened' },
  { ascLabel: 'Older -> Recent', descLabel: 'Recent -> Older', key: 'dateImported', label: 'Date imported' },
  { ascLabel: 'A -> Z', descLabel: 'Z -> A', key: 'title', label: 'Title' }
];

type ImportCatalogTranslate = ReturnType<typeof useTranslation>;

export function getImportCatalogSortOptions(t: ImportCatalogTranslate): ImportCatalogSortOption[] {
  return [
    {
      ascLabel: t('desktop.importCatalog.sort.olderRecent'),
      descLabel: t('desktop.importCatalog.sort.recentOlder'),
      key: 'dateLastOpened',
      label: t('desktop.importCatalog.sort.lastOpened')
    },
    {
      ascLabel: t('desktop.importCatalog.sort.olderRecent'),
      descLabel: t('desktop.importCatalog.sort.recentOlder'),
      key: 'dateImported',
      label: t('desktop.importCatalog.sort.dateImported')
    },
    {
      ascLabel: t('desktop.importCatalog.sort.az'),
      descLabel: t('desktop.importCatalog.sort.za'),
      key: 'title',
      label: t('desktop.importCatalog.sort.title')
    }
  ];
}

export type ImportCatalogSortKey = 'dateImported' | 'dateLastOpened' | 'title';
const IMPORT_CATALOG_SORT_KEYS: ImportCatalogSortKey[] = ['dateImported', 'dateLastOpened', 'title'];

type SortableImportItem = {
  sortLastOpened: string | null;
  sortSaved: string;
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

function compareSavedDesc(left: string, right: string) {
  return right.localeCompare(left);
}

export function resolveImportLastOpened(nodeId: string | null | undefined, nodeViewById: Record<string, NodeViewState | undefined>) {
  const updatedAt = nodeId ? nodeViewById[nodeId]?.updatedAt?.trim() : null;
  if (updatedAt && !Number.isNaN(new Date(updatedAt).getTime())) {
    return updatedAt;
  }
  return null;
}

export function parseImportCatalogSortKey(value: unknown) {
  return parseLiteralUnion(value, IMPORT_CATALOG_SORT_KEYS);
}

export function sortImportCatalogItems<T extends SortableImportItem>(
  items: T[],
  sortKey: ImportCatalogSortKey,
  sortDirection: 'asc' | 'desc'
) {
  const directionMultiplier = sortDirection === 'asc' ? -1 : 1;

  return [...items].sort((left, right) => {
    if (sortKey === 'title') {
      const titleResult = compareText(left.sortTitle, right.sortTitle) * (sortDirection === 'asc' ? 1 : -1);
      if (titleResult !== 0) {
        return titleResult;
      }
      return compareSavedDesc(left.sortSaved, right.sortSaved);
    }

    if (sortKey === 'dateImported') {
      const savedResult = compareSavedDesc(left.sortSaved, right.sortSaved) * directionMultiplier;
      if (savedResult !== 0) {
        return savedResult;
      }
      return compareText(left.sortTitle, right.sortTitle);
    }

    const lastOpenedResult = compareLastOpenedDesc(left.sortLastOpened, right.sortLastOpened) * directionMultiplier;
    if (lastOpenedResult !== 0) {
      return lastOpenedResult;
    }

    const savedResult = compareSavedDesc(left.sortSaved, right.sortSaved);
    if (savedResult !== 0) {
      return savedResult;
    }

    return compareText(left.sortTitle, right.sortTitle);
  });
}
