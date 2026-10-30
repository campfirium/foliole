export async function loadDesktopJourneyFacts(session) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const entries = Object.entries(snapshot.nodesById).filter(([, node]) =>
    /^Multi-device sync [AC] fact/u.test(String(node.title))).sort(([left], [right]) => left.localeCompare(right));
  return Promise.all(entries.map(async ([id, node]) => {
    const document = await session.invoke('load_node_document', { nodeId: id });
    if (document?.nodeId !== id || typeof document.content !== 'string') {
      throw new Error(`Journey document is unavailable: ${id}`);
    }
    return { id, title: node.title, content: document.content };
  }));
}

export function assertSameJourneyFacts(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== 3
      || before.filter(node => /^Multi-device sync A fact/u.test(node.title)).length !== 2
      || before.filter(node => /^Multi-device sync C fact/u.test(node.title)).length !== 1
      || JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Journey facts changed: expected the same two Mac facts and Windows fact with complete bodies');
  }
}
