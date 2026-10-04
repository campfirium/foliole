/** A peer may have acquired an older fork indirectly before publishing its latest head. */
export function preserveLiveForkBodies(keep: Set<string>,
  ancestors: ReadonlyMap<string, ReadonlySet<string>>, localHeads: ReadonlySet<string>) {
  const live = new Set([...keep].flatMap((id) => [...ancestors.get(id) ?? []]));
  for (const localId of localHeads) {
    const local = ancestors.get(localId);
    if (!local) continue;
    for (const remoteId of live) {
      const remote = ancestors.get(remoteId);
      if (!remote || local.has(remoteId) || remote.has(localId)) continue;
      const common = new Set([...local].filter((id) => remote.has(id)));
      for (const id of [...common]) for (const older of ancestors.get(id) ?? []) {
        if (older !== id) common.delete(older);
      }
      for (const id of common) keep.add(id);
    }
  }
}
