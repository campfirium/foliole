export interface WatchedFolderGroupSource {
  action_mode: 'delete' | 'keep';
  binding_id: string;
  connection_status: 'connected' | 'needs-folder';
  created_at: string;
  highlight_mode: 'merged' | 'split';
  host_name: string;
  host_platform: string;
  legacy_rule_id?: string | null;
  owner_device_identity_key: string;
  reported_path: string;
  source_ref: string;
  updated_at: string;
}

export interface WatchedFolderConflictDecision {
  conflict_key: string;
  decided_at: string;
  decided_by_device_identity_key: string;
  decision_id: string;
  group_id: string;
  selected_binding_ids: string[];
}

export interface WatchedFolderConflict {
  conflict_key: string;
  path: string;
  sources: WatchedFolderGroupSource[];
}

export function watchedFolderConflictKey(path: string, sources: Pick<WatchedFolderGroupSource, 'binding_id'>[]) {
  return JSON.stringify([path, sources.map((source) => source.binding_id).sort()]);
}

export function groupWatchedFolderConflicts(sources: WatchedFolderGroupSource[]) {
  const byPath = new Map<string, WatchedFolderGroupSource[]>();
  for (const source of sources) {
    if (!source.reported_path) continue;
    const group = byPath.get(source.reported_path) ?? [];
    group.push(source);
    byPath.set(source.reported_path, group);
  }
  return [...byPath].flatMap(([path, group]): WatchedFolderConflict[] => (
    new Set(group.map((source) => source.owner_device_identity_key)).size > 1
      ? [{ conflict_key: watchedFolderConflictKey(path, group), path,
        sources: group.sort((a, b) => a.binding_id.localeCompare(b.binding_id)) }]
      : []
  ));
}

export function parseWatchedFolderGroupSource(value: unknown): WatchedFolderGroupSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('watched_source_invalid');
  const source = value as Record<string, unknown>;
  for (const key of ['binding_id', 'created_at', 'host_name', 'host_platform',
    'owner_device_identity_key', 'reported_path', 'source_ref', 'updated_at']) {
    if (typeof source[key] !== 'string') throw new Error('watched_source_invalid');
  }
  if (!['delete', 'keep'].includes(String(source.action_mode)) ||
      !['connected', 'needs-folder'].includes(String(source.connection_status)) ||
      !['merged', 'split'].includes(String(source.highlight_mode))) {
    throw new Error('watched_source_invalid');
  }
  if (source.legacy_rule_id !== undefined && source.legacy_rule_id !== null &&
      typeof source.legacy_rule_id !== 'string') throw new Error('watched_source_invalid');
  return source as unknown as WatchedFolderGroupSource;
}

export function parseWatchedFolderConflictDecision(value: unknown): WatchedFolderConflictDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('watched_decision_invalid');
  const decision = value as Record<string, unknown>;
  for (const key of ['conflict_key', 'decided_at', 'decided_by_device_identity_key',
    'decision_id', 'group_id']) {
    if (typeof decision[key] !== 'string' || !decision[key]) throw new Error('watched_decision_invalid');
  }
  if (!Array.isArray(decision.selected_binding_ids) ||
      !decision.selected_binding_ids.length ||
      decision.selected_binding_ids.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('watched_decision_invalid');
  }
  const key = JSON.parse(decision.conflict_key as string) as unknown;
  const ids = Array.isArray(key) ? key[1] : null;
  if (!Array.isArray(key) || key.length !== 2 || typeof key[0] !== 'string' ||
      !Array.isArray(ids) || ids.some((id) => typeof id !== 'string') ||
      decision.selected_binding_ids.some((id) => !ids.includes(id))) {
    throw new Error('watched_decision_invalid');
  }
  return decision as unknown as WatchedFolderConflictDecision;
}
