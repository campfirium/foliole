import { z } from 'zod';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';

const version = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string().nullable(),
  z.enum(['available', 'deleted', 'missing']), z.string().nullable()]);

export function changedNodeVersionIds(source: FramedSyncInventoryEntry, destination?: FramedSyncInventoryEntry) {
  const present = new Map((destination?.versionStates ?? []).map(text => {
    const value = version.parse(JSON.parse(text));
    return [value[0], value] as const;
  }));
  const described = new Set<string>();
  const changed = (source.versionStates ?? []).flatMap(text => {
    const value = version.parse(JSON.parse(text));
    described.add(value[0]);
    const other = present.get(value[0]);
    if (other?.[5] === 'deleted' || value[5] === 'missing') return other ? [] : [value[0]];
    return other && JSON.stringify(other) === text ? [] : [value[0]];
  });
  const known = new Set(destination?.frontierFactIds ?? []);
  return [...changed, ...source.frontierFactIds.filter(id => !described.has(id) && !known.has(id))];
}

export function needsNodeCurrentReference(source: FramedSyncInventoryEntry, destination?: FramedSyncInventoryEntry) {
  return Boolean(source.currentVersionId) && (!destination || source.currentVersionId !== destination.currentVersionId);
}
