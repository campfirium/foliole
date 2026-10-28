interface PathNode { id: string; parentNodeId: string | null }

export type WorkspaceNodePaths = ReadonlyMap<string, readonly string[]>;

// Paths contain UUIDs, including the node itself and a missing direct ancestor.
export function updateWorkspaceNodePaths(nodes: ReadonlyMap<string, PathNode>,
  paths: Map<string, readonly string[]>, changed: ReadonlySet<string>) {
  for (const id of changed) paths.delete(id);
  for (const id of changed) {
    if (!nodes.has(id) || paths.has(id)) continue;
    const trail: string[] = [];
    const visited = new Set<string>();
    let current: string | null = id;
    while (current && !paths.has(current) && !visited.has(current)) {
      trail.push(current);
      visited.add(current);
      current = nodes.get(current)?.parentNodeId ?? null;
    }
    if (current && visited.has(current)) {
      for (const member of trail) if (nodes.has(member)) paths.set(member, cyclicPath(member, nodes));
      continue;
    }
    let prefix = current ? paths.get(current)! : [];
    for (const member of trail.reverse()) {
      prefix = [...prefix, member];
      if (nodes.has(member)) paths.set(member, prefix);
    }
  }
}

function cyclicPath(id: string, nodes: ReadonlyMap<string, PathNode>) {
  const path = [id];
  const visited = new Set(path);
  let current = nodes.get(id)?.parentNodeId ?? null;
  while (current && !visited.has(current)) {
    path.unshift(current);
    visited.add(current);
    current = nodes.get(current)?.parentNodeId ?? null;
  }
  return path;
}

export function createWorkspaceNodePaths(nodes: Iterable<PathNode>): WorkspaceNodePaths {
  const byId = new Map(Array.from(nodes, node => [node.id, node]));
  const paths = new Map<string, readonly string[]>();
  updateWorkspaceNodePaths(byId, paths, new Set(byId.keys()));
  return paths;
}
