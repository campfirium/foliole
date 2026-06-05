import { useEffect, useMemo, useState, type RefObject } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { getSettingsCategories, type SettingsCategoryId } from '../model/settingsPanelOptions';
import {
  querySettingsSearch,
  type SettingsSearchResult
} from '../model/settingsSearch';
import { createSettingsSearchRows } from '../model/settingsSearchRowCatalog';

const SETTINGS_SEARCH_HIGHLIGHT_CLASSES = [
  'bg-[rgb(var(--app-accent-color-rgb)_/_0.12)]',
  'shadow-[inset_0_0_0_1px_rgb(var(--app-accent-color-rgb)_/_0.34)]',
  'transition-[background-color,box-shadow]',
  'duration-150'
];

export function useSettingsSearchState(setActiveCategory: (category: SettingsCategoryId) => void) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const categories = useMemo(() => getSettingsCategories(t), [t]);
  const rows = useMemo(() => createSettingsSearchRows(t), [t]);
  const results = useMemo(() => querySettingsSearch(categories, rows, query), [categories, query, rows]);

  useEffect(() => setActiveResultIndex(0), [query]);

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    if (!nextQuery.trim()) setTargetRowId(null);
  };
  const selectResult = (result: SettingsSearchResult) => {
    setActiveCategory(result.categoryId);
    setTargetRowId(result.rowId ?? null);
  };

  return {
    activeResultIndex: results.length ? Math.min(activeResultIndex, results.length - 1) : 0,
    query,
    results,
    selectResult,
    setActiveResultIndex,
    targetRowId,
    updateQuery
  };
}

export function useSettingsSearchTarget(
  activeCategory: SettingsCategoryId,
  targetRowId: string | null,
  scrollContainerRef: RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!targetRowId) return undefined;
    const target = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-settings-search-row-id="${targetRowId}"]`);
    if (!target) return undefined;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add(...SETTINGS_SEARCH_HIGHLIGHT_CLASSES);
    const timeout = window.setTimeout(() => target.classList.remove(...SETTINGS_SEARCH_HIGHLIGHT_CLASSES), 1600);
    return () => {
      window.clearTimeout(timeout);
      target.classList.remove(...SETTINGS_SEARCH_HIGHLIGHT_CLASSES);
    };
  }, [activeCategory, scrollContainerRef, targetRowId]);
}
