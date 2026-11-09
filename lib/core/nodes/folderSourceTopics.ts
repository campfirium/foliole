export function resolveFolderSourceTopicIds(
  sourceIds: readonly string[],
  tree: {
    kindOf: (id: string) => string | undefined;
    childrenOf: (id: string) => readonly string[];
  }
): string[] {
  const members = new Set<string>();
  const visited = new Set<string>();
  for (const id of sourceIds) {
    const kind = tree.kindOf(id);
    if (kind === 'topic') members.add(id);
    if (kind !== 'folder') continue;
    const pending = [id];
    while (pending.length) {
      const descendant = pending.pop()!;
      if (visited.has(descendant)) continue;
      visited.add(descendant);
      const descendantKind = tree.kindOf(descendant);
      if (descendantKind === 'topic') members.add(descendant);
      if (descendantKind !== 'folder') continue;
      const children = tree.childrenOf(descendant);
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]!);
    }
  }
  return [...members];
}
