const openCounts = new Map<string, number>();

/** Folders the user is viewing; snapshot refreshes recompute their database text results. */
export function retainCompanionOpenVirtualFolder(nodeId: string) {
  openCounts.set(nodeId, (openCounts.get(nodeId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (openCounts.get(nodeId) ?? 1) - 1;
    if (count > 0) openCounts.set(nodeId, count);
    else openCounts.delete(nodeId);
  };
}

export function listCompanionOpenVirtualFolders() {
  return [...openCounts.keys()];
}
