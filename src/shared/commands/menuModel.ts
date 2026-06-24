import type { CommandPaletteItem } from './types';

export interface CommandMenuSection {
  id: string;
  title: string;
  items: CommandPaletteItem[];
}

interface BuildCommandMenuSectionsOptions {
  recentTitle?: string;
}

const SECTION_ORDER = [
  'Navigation',
  'Create',
  'Workspace',
  'Editor',
  'Review',
  'Import',
  'Settings',
  'Developer'
];
const SECTION_RANK = new Map(SECTION_ORDER.map((section, index) => [section, index]));

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

function compareSectionTitles(a: string, b: string) {
  const aRank = SECTION_RANK.get(a) ?? Number.MAX_SAFE_INTEGER;
  const bRank = SECTION_RANK.get(b) ?? Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  return a.localeCompare(b);
}

function toSectionId(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildGroupedSections(items: CommandPaletteItem[]): CommandMenuSection[] {
  const bySection = new Map<string, { items: CommandPaletteItem[]; title: string }>();
  for (const item of items) {
    const title = item.section?.trim() || 'Other';
    const id = item.sectionId?.trim() || title;
    const group = bySection.get(id);
    bySection.set(id, { title, items: [...(group?.items ?? []), item] });
  }
  return [...bySection.entries()]
    .sort(([a], [b]) => compareSectionTitles(a, b))
    .map(([id, section]) => ({
      id: toSectionId(id),
      title: section.title,
      items: section.items.sort(compareCommandItems)
    }));
}

export function buildCommandMenuSections(
  items: CommandPaletteItem[],
  recentCommandIds: string[],
  query = '',
  options: BuildCommandMenuSectionsOptions = {}
): CommandMenuSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const recentSet = new Set(recentCommandIds);
  const recentRank = new Map(recentCommandIds.map((id, index) => [id, index]));
  const recentItems = items
    .filter((item) => recentSet.has(item.id) && matchesQuery(item, normalizedQuery))
    .sort((a, b) => (recentRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const commandItems = items
    .filter((item) => !recentSet.has(item.id) && matchesQuery(item, normalizedQuery))
    .sort(compareCommandItems);
  const sections = buildGroupedSections(commandItems);

  if (recentItems.length) {
    sections.unshift({
      id: 'recent',
      title: options.recentTitle ?? 'Recent',
      items: recentItems
    });
  }

  return sections;
}
