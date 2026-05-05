import type { CommandPaletteItem } from './types';

export interface CommandMenuSection {
  id: string;
  title: string;
  items: CommandPaletteItem[];
}

const SECTION_ORDER = ['System', 'Navigation', 'Workspace', 'Editor', 'Review', 'Settings', 'Other'];

function getSectionPriority(section: string) {
  const index = SECTION_ORDER.indexOf(section);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function normalizeSection(value: string | undefined) {
  return value?.trim() || 'Other';
}

function matchesQuery(item: CommandPaletteItem, query: string) {
  if (!query) {
    return true;
  }
  const haystack = [item.title, item.id, item.section, ...(item.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(query);
}

export function buildCommandMenuSections(items: CommandPaletteItem[], recentCommandIds: string[], query = ''): CommandMenuSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const sectionMap = new Map<string, CommandPaletteItem[]>();
  const recentSet = new Set(recentCommandIds);
  const recentRank = new Map(recentCommandIds.map((id, index) => [id, index]));
  const recentItems = items
    .filter((item) => recentSet.has(item.id) && matchesQuery(item, normalizedQuery))
    .sort((a, b) => (recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER));

  for (const item of items) {
    if (recentSet.has(item.id)) {
      continue;
    }
    if (!matchesQuery(item, normalizedQuery)) {
      continue;
    }
    const section = normalizeSection(item.section);
    const sectionItems = sectionMap.get(section);
    if (sectionItems) {
      sectionItems.push(item);
      continue;
    }
    sectionMap.set(section, [item]);
  }

  const normalSections = [...sectionMap.entries()]
    .sort(([a], [b]) => {
      const byPriority = getSectionPriority(a) - getSectionPriority(b);
      if (byPriority !== 0) {
        return byPriority;
      }
      return a.localeCompare(b);
    })
    .map(([title, sectionItems]) => ({
      id: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      items: [...sectionItems].sort((a, b) => a.title.localeCompare(b.title))
    }));

  if (!recentItems.length) {
    return normalSections;
  }

  return [
    {
      id: 'recent',
      title: 'Recent',
      items: recentItems
    },
    ...normalSections
  ];
}
