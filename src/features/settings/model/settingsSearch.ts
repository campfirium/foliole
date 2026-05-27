import {
  SETTINGS_CATEGORIES,
  type SettingsCategoryId
} from './settingsPanelOptions';

export type SettingsSearchResultKind = 'category' | 'row';

export interface SettingsSearchRowMeta {
  categoryId: SettingsCategoryId;
  description: string;
  id: string;
  searchTerms?: string[];
  title: string;
}

export interface SettingsSearchResult {
  categoryId: SettingsCategoryId;
  description: string;
  id: string;
  kind: SettingsSearchResultKind;
  rowId?: string;
  title: string;
}

export function settingsSearchRowProps(
  row: SettingsSearchRowMeta
): { 'data-settings-search-row-id': string } {
  return { 'data-settings-search-row-id': row.id };
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearchText(values: Array<string | undefined>, query: string) {
  return values.some((value) => value && normalizeSearchText(value).includes(query));
}

export function querySettingsSearch(
  rows: SettingsSearchRowMeta[],
  rawQuery: string
): SettingsSearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const categoryResults = SETTINGS_CATEGORIES.filter((category) =>
    matchesSearchText([category.label, category.description], query)
  ).map<SettingsSearchResult>((category) => ({
    categoryId: category.id,
    description: category.description,
    id: `category:${category.id}`,
    kind: 'category',
    title: category.label
  }));

  const rowResults = rows.filter((row) =>
    matchesSearchText([row.title, row.description, ...(row.searchTerms ?? [])], query)
  ).map<SettingsSearchResult>((row) => ({
    categoryId: row.categoryId,
    description: row.description,
    id: `row:${row.id}`,
    kind: 'row',
    rowId: row.id,
    title: row.title
  }));

  return [...categoryResults, ...rowResults];
}
