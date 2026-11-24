import { externalFolderVisibleSql } from '../../../../../lib/core/database/externalFolderMembershipVisibility';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { getCompanionReadingScope } from '../reading/companionReadingScope';

const initial = { revision: 0, departures: new Map<string, number>() };
let visibility = initial;
let scope = getCompanionReadingScope();
const listeners = new Set<() => void>();

export function getCompanionExternalVisibility() {
  return scope === getCompanionReadingScope() ? visibility : initial;
}

export function wasCompanionExternalFolderHidden(folderId: string, revision: number,
  current: ReturnType<typeof getCompanionExternalVisibility>) {
  return (current.departures.get(folderId) ?? 0) > revision;
}

export function subscribeCompanionExternalVisibility(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function loadVisibleCompanionExternalFolderIds(db: DbPort) {
  const rows = await db.query<{ config_ref: string }>(`SELECT config_ref FROM desktop_sources
    WHERE source_type = 'external' AND ${externalFolderVisibleSql('config_ref')}`);
  return new Set(rows.map(row => row.config_ref));
}

export function publishCompanionExternalVisibilityChanged(before: Set<string>, after: Set<string>, committedScope: object) {
  if (committedScope !== getCompanionReadingScope()) return;
  const hidden = [...before].filter(id => !after.has(id));
  if (hidden.length === 0 && [...after].every(id => before.has(id))) return;
  const current = getCompanionExternalVisibility();
  const revision = current.revision + 1;
  const departures = new Map(current.departures);
  for (const id of hidden) departures.set(id, revision);
  visibility = { revision, departures };
  scope = committedScope;
  for (const listener of listeners) {
    try { listener(); }
    catch { /* A view observer cannot invalidate committed membership. */ }
  }
}
