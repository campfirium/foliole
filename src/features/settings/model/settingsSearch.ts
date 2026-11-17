import type { SettingsCategoryId, SettingsCategoryOption } from './settingsPanelOptions';

type SettingsSearchResultKind = 'category' | 'row';

export interface SettingsSearchRowMeta {
  categoryId: SettingsCategoryId;
  description: string;
  id: string;
  searchTerms?: string[];
  title: string;
}

export type SettingsSearchRowId = SettingsSearchRowMeta['id'];

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
  categories: SettingsCategoryOption[],
  rows: SettingsSearchRowMeta[],
  rawQuery: string,
  alternateMatches: ReadonlySet<string> = new Set()
): SettingsSearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const categoryResults = categories.filter((category) =>
    alternateMatches.has(`category:${category.id}`) || matchesSearchText([category.label, category.description], query)
  ).map<SettingsSearchResult>((category) => ({
    categoryId: category.id,
    description: category.description,
    id: `category:${category.id}`,
    kind: 'category',
    title: category.label
  }));

  const rowResults = rows.filter((row) =>
    alternateMatches.has(`row:${row.id}`) || matchesSearchText([row.title, row.description, ...(row.searchTerms ?? [])], query)
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
