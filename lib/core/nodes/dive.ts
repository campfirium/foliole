export interface Dive {
  id: string;
  title: string;
  directSourceIds: readonly string[];
}

export function resolveDiveTopicIds(
  dive: Dive,
  tree: {
    kindOf: (id: string) => string | undefined;
    childrenOf: (id: string) => readonly string[];
  }
): string[] {
  const members = new Set<string>();
  const visited = new Set<string>();
  for (const id of dive.directSourceIds) {
    const kind = tree.kindOf(id);
    if (kind === 'topic') members.add(id);
    if (kind !== 'folder') continue;
    const pending = [id];
    while (pending.length) {
      const descendant = pending.pop()!;
      if (visited.has(descendant)) continue;
      visited.add(descendant);
      const descendantKind = tree.kindOf(descendant);
      if (!descendantKind) continue;
      if (descendantKind === 'topic') members.add(descendant);
      const children = tree.childrenOf(descendant);
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]!);
    }
  }
  return [...members];
}
