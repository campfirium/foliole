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
  const tombstoned = tombstoneOnlyVersionIds(destination);
  const changed = (source.versionStates ?? []).flatMap(text => {
    const value = version.parse(JSON.parse(text));
    described.add(value[0]);
    const other = present.get(value[0]);
    if (!other && value[5] === 'deleted' && tombstoned.has(value[0])) return [];
    if (other?.[5] === 'deleted' || value[5] === 'missing') return other ? [] : [value[0]];
    return other && JSON.stringify(other) === text ? [] : [value[0]];
  });
  const known = new Set(destination?.frontierFactIds ?? []);
  return [...changed, ...source.frontierFactIds.filter(id => !described.has(id) && !known.has(id))];
}

/** A relation into a version the destination holds as its tombstone is already recorded by that tombstone. */
export function missingNodeRelationIds(source: FramedSyncInventoryEntry, destination?: FramedSyncInventoryEntry) {
  const present = new Set(destination?.requiredRelationIds ?? []);
  const tombstoned = tombstoneOnlyVersionIds(destination);
  return source.requiredRelationIds.filter(id => !present.has(id) && !tombstoned.has(relationChild(id)));
}

/**
 * A received permanent deletion is kept as a tombstone rather than a version row, so its version is listed in
 * the frontier without a version state; its deleted body and parent need nothing more from the source.
 */
function tombstoneOnlyVersionIds(entry?: FramedSyncInventoryEntry) {
  const described = new Set((entry?.versionStates ?? []).map(text => version.parse(JSON.parse(text))[0]));
  return new Set((entry?.frontierFactIds ?? []).filter(id => !described.has(id)));
}

function relationChild(id: string) {
  const value: unknown = JSON.parse(id);
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

export function needsNodeCurrentReference(source: FramedSyncInventoryEntry, destination?: FramedSyncInventoryEntry) {
  return Boolean(source.currentVersionId) && (!destination || source.currentVersionId !== destination.currentVersionId);
}
