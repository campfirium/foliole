export function buildCanonicalSyncTombstone(objectId: string) {
  return { deleted: true as const, object_id: objectId };
}
