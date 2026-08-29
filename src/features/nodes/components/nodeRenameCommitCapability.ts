type ActiveNodeRenameCommit = () => Promise<boolean>;

let activeNodeRenameCommit: ActiveNodeRenameCommit | null = null;

export function registerActiveNodeRenameCommit(commit: ActiveNodeRenameCommit) {
  activeNodeRenameCommit = commit;
  return () => {
    if (activeNodeRenameCommit === commit) activeNodeRenameCommit = null;
  };
}

export function commitActiveNodeRename() {
  return activeNodeRenameCommit?.() ?? Promise.resolve(true);
}
