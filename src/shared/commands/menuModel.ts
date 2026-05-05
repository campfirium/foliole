import type { CommandPaletteItem } from './types';

export interface CommandMenuSection {
  id: string;
  title: string;
  items: CommandPaletteItem[];
}

function matchesQuery(item: CommandPaletteItem, query: string) {
  if (!query) {
    return true;
  }
  const haystack = [item.title, item.id, item.section, ...(item.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(query);
}

function compareCommandItems(a: CommandPaletteItem, b: CommandPaletteItem) {
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) {
    return byTitle;
  }
  return a.id.localeCompare(b.id);
}

export function buildCommandMenuSections(items: CommandPaletteItem[], recentCommandIds: string[], query = ''): CommandMenuSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const recentSet = new Set(recentCommandIds);
  const recentRank = new Map(recentCommandIds.map((id, index) => [id, index]));
  const recentItems = items
    .filter((item) => recentSet.has(item.id) && matchesQuery(item, normalizedQuery))
    .sort((a, b) => (recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const commandItems = items
    .filter((item) => !recentSet.has(item.id) && matchesQuery(item, normalizedQuery))
    .sort(compareCommandItems);
  const sortedItems = [...recentItems, ...commandItems];

  if (!sortedItems.length) {
    return [];
  }

  return [
    {
      id: 'commands',
      title: 'Commands',
      items: sortedItems
    }
  ];
}
