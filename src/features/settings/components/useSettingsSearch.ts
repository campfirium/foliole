import { useEffect, useMemo, useState, type RefObject } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { isDesktopRuntime } from '../../../shared/platform/runtime';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';
import { useDesktopCustomCss } from '../context/DesktopCustomCssProvider';
import { canShowQuitOnClose, QUIT_ON_CLOSE_SEARCH_ROW_ID } from '../model/quitOnCloseAvailability';
import { getSettingsCategories, type SettingsCategoryId } from '../model/settingsPanelOptions';
import {
  querySettingsSearch,
  type SettingsSearchResult
} from '../model/settingsSearch';
import {
  createSettingsSearchRows,
  SETTINGS_BACKUP_SEARCH_ROW_ID,
  SETTINGS_CAPTURE_POSITION_SEARCH_ROW_ID,
  SETTINGS_CAPTURE_SEARCH_ROW_ID,
  SETTINGS_CLI_SEARCH_ROW_ID,
  SETTINGS_CUSTOM_CSS_ROW_ID,
  SETTINGS_LIBRARY_MERGE_SEARCH_ROW_ID,
  SETTINGS_LOCAL_ATTACHMENTS_SEARCH_ROW_ID,
  SETTINGS_MARKDOWN_ASSOCIATION_SEARCH_ROW_ID,
  SETTINGS_LEARNING_IMPORT_SEARCH_ROW_ID,
  SETTINGS_SUPER_MEMO_SEARCH_ROW_ID
} from '../model/settingsSearchRowCatalog';

const DESKTOP_ONLY_SEARCH_ROWS = new Set([
  SETTINGS_BACKUP_SEARCH_ROW_ID,
  SETTINGS_CLI_SEARCH_ROW_ID,
  SETTINGS_LEARNING_IMPORT_SEARCH_ROW_ID,
  SETTINGS_LIBRARY_MERGE_SEARCH_ROW_ID,
  SETTINGS_LOCAL_ATTACHMENTS_SEARCH_ROW_ID,
  SETTINGS_MARKDOWN_ASSOCIATION_SEARCH_ROW_ID,
  SETTINGS_SUPER_MEMO_SEARCH_ROW_ID
]);

const SETTINGS_SEARCH_HIGHLIGHT_CLASSES = [
  'bg-[rgb(var(--role-accent-rgb)_/_0.12)]',
  'shadow-[inset_0_0_0_1px_rgb(var(--role-accent-rgb)_/_0.34)]',
  'transition-[background-color,box-shadow]',
  'duration-150'
];

export function useSettingsSearchIndex(previewDesktopSettings = false) {
  const t = useTranslation();
  const categories = getSettingsCategories(t);
  const hasCustomCss = Boolean(useDesktopCustomCss());
  const showQuitOnClose = canShowQuitOnClose(previewDesktopSettings);
  const showDesktopOnlyRows = !previewDesktopSettings && isDesktopRuntime();
  const platform = resolveRuntimeOperatingSystem();
  const showMacOrWindowsRows = showDesktopOnlyRows && platform !== 'other';
  const showCapturePosition = showDesktopOnlyRows && platform === 'macos';
  const rows = useMemo(() => createSettingsSearchRows(t).filter(
    (row) => (hasCustomCss || row.id !== SETTINGS_CUSTOM_CSS_ROW_ID)
      && (showQuitOnClose || row.id !== QUIT_ON_CLOSE_SEARCH_ROW_ID)
      && (showMacOrWindowsRows || row.id !== SETTINGS_CAPTURE_SEARCH_ROW_ID)
      && (showCapturePosition || row.id !== SETTINGS_CAPTURE_POSITION_SEARCH_ROW_ID)
      && (showDesktopOnlyRows || !DESKTOP_ONLY_SEARCH_ROWS.has(row.id))
  ), [hasCustomCss, showCapturePosition, showDesktopOnlyRows, showMacOrWindowsRows, showQuitOnClose, t]);
  return { categories, rows };
}

export function useSettingsSearchState(
  setActiveCategory: (category: SettingsCategoryId) => void,
  requestedRowId: string | null = null,
  previewDesktopSettings = false
) {
  const [query, setQuery] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [targetBlock, setTargetBlock] = useState<ScrollLogicalPosition>('center');
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const { categories, rows } = useSettingsSearchIndex(previewDesktopSettings);
  const results = querySettingsSearch(categories, rows, query);

  useEffect(() => setActiveResultIndex(0), [query]);
  useEffect(() => {
    setTargetBlock('start');
    setTargetRowId(requestedRowId);
  }, [requestedRowId]);

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    if (!nextQuery.trim()) setTargetRowId(null);
  };
  const selectResult = (result: SettingsSearchResult) => {
    setActiveCategory(result.categoryId);
    setTargetBlock('center');
    setTargetRowId(result.rowId ?? null);
  };

  return {
    activeResultIndex: results.length ? Math.min(activeResultIndex, results.length - 1) : 0,
    query,
    results,
    selectResult,
    setActiveResultIndex,
    targetBlock,
    targetRowId,
    updateQuery
  };
}

export function useSettingsSearchTarget(
  activeCategory: SettingsCategoryId,
  targetRowId: string | null,
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  block: ScrollLogicalPosition = 'center'
) {
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !targetRowId) return undefined;
    const selector = `[data-settings-search-row-id="${targetRowId}"]`;
    let clearHighlight: (() => void) | undefined;
    const revealTarget = () => {
      const target = container.querySelector<HTMLElement>(selector);
      if (!target) return;
      observer.disconnect();
      clearHighlight = highlightSearchTarget(target, block);
    };

    const observer = new MutationObserver(revealTarget);
    observer.observe(container, { childList: true, subtree: true });
    revealTarget();
    return () => {
      observer.disconnect();
      clearHighlight?.();
    };
  }, [activeCategory, block, scrollContainerRef, targetRowId]);
}

function highlightSearchTarget(target: HTMLElement, block: ScrollLogicalPosition) {
  target.scrollIntoView({ block, behavior: 'smooth' });
  target.classList.add(...SETTINGS_SEARCH_HIGHLIGHT_CLASSES);
  const removeHighlight = () => target.classList.remove(...SETTINGS_SEARCH_HIGHLIGHT_CLASSES);
  const timeout = window.setTimeout(removeHighlight, 1600);
  return () => {
    window.clearTimeout(timeout);
    removeHighlight();
  };
}
