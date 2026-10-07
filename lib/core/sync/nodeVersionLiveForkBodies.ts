/** A peer may have acquired an older fork indirectly before publishing its latest head. */
export function preserveLiveForkBodies(keep: Set<string>,
  ancestors: ReadonlyMap<string, ReadonlySet<string>>, localHeads: ReadonlySet<string>,
  parents: (id: string) => readonly string[]) {
  const live = new Set([...keep].flatMap((id) => [...ancestors.get(id) ?? []]));
  for (const localId of localHeads) {
    const local = ancestors.get(localId);
    if (!local) continue;
    for (const remoteId of live) {
      if (local.has(remoteId)) continue;
      const remote = ancestors.get(remoteId);
      if (!remote || remote.has(localId)) continue;
      const common = new Set([...local].filter((id) => remote.has(id)));
      for (const id of [...common]) for (const parent of parents(id)) common.delete(parent);
      for (const id of common) keep.add(id);
    }
  }
}
