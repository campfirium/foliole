interface WorkspaceRecordPatch<T> {
  changedIds: readonly string[];
  previous: Record<string, T>;
}

const recordPatches = new WeakMap<object, WorkspaceRecordPatch<unknown>>();

export function recordWorkspaceRecordPatch<T>(
  previous: Record<string, T>,
  next: Record<string, T>,
  changedIds: readonly string[]
) {
  recordPatches.set(next, { changedIds, previous });
  return next;
}

export function patchWorkspaceRecord<T>(
  previous: Record<string, T>,
  changes: Record<string, T>
) {
  const next = { ...previous, ...changes };
  return recordWorkspaceRecordPatch(previous, next, Object.keys(changes));
}

export function readWorkspaceRecordPatch<T>(
  next: Record<string, T>,
  previous: Record<string, T>
) {
  const patch = recordPatches.get(next) as WorkspaceRecordPatch<T> | undefined;
  return patch?.previous === previous ? patch.changedIds : null;
}
