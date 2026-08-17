export class WorkspacePartialPersistenceError extends Error {
  constructor() {
    super('Workspace persistence stopped after a partial write.');
    this.name = 'WorkspacePartialPersistenceError';
  }
}

export function isWorkspacePartialPersistenceError(error: unknown) {
  return error instanceof WorkspacePartialPersistenceError;
}
