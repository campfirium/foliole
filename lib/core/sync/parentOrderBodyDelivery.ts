/** Supply only missing immutable arrangement bodies, then retry the same frozen delivery. */
export async function sendWithRequiredParentOrderBodies<T>(send: () => Promise<T>,
  supply: (versionId: string) => Promise<void>): Promise<T> {
  const supplied = new Set<string>();
  for (;;) {
    try { return await send(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const prefix = 'sync_parent_order_body_unavailable:';
      const index = message.indexOf(prefix);
      const versionId = index < 0 ? '' : message.slice(index + prefix.length).trim().split(/\s/u, 1)[0]!;
      if (!versionId || supplied.has(versionId)) throw error;
      supplied.add(versionId);
      await supply(versionId);
    }
  }
}
