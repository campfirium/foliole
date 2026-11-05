import type { DocumentOutlineNavigation, DocumentOutlineSection, DocumentPositionEntry } from './documentOutlineNavigation';

export type DocumentOutlineRow = {
  key: string;
  section: DocumentOutlineSection;
  entry?: DocumentPositionEntry;
  depth: number;
};

export function collectVisibleOutlineRows(model: DocumentOutlineNavigation,
  collapsedSections: ReadonlySet<string>, expandedEntries: ReadonlySet<string>) {
  const rows: DocumentOutlineRow[] = [];
  for (const section of model.sections) {
    if (section.text) rows.push({ key: section.id, section, depth: section.level });
    if (collapsedSections.has(section.id)) continue;
    const pending = section.entryIds.map(id => ({ id, depth: section.level })).reverse();
    const visited = new Set<string>();
    while (pending.length) {
      const { id, depth } = pending.pop()!;
      const entry = model.entries[id];
      if (!entry || visited.has(id)) continue;
      visited.add(id);
      rows.push({ key: `entry:${id}`, section, entry, depth });
      if (expandedEntries.has(id)) {
        for (const childId of [...entry.childIds].reverse()) pending.push({ id: childId, depth: depth + 1 });
      }
    }
  }
  return rows;
}
