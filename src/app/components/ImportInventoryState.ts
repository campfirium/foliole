export type ImportInventoryLoadIssue =
  | { kind: 'failed'; message: string }
  | { kind: 'unavailable' };

export type ImportInventoryCatalogState = {
  description: string;
  title: string;
};

export function createImportInventoryErrorState(input: {
  catalogName: string;
  issue: Extract<ImportInventoryLoadIssue, { kind: 'failed' }>;
  onRetry: () => void;
}) {
  return {
    description: input.issue.message,
    onRetry: input.onRetry,
    title: `Failed to load ${input.catalogName}`
  };
}

export function createImportInventoryUnavailableState(catalogName: string): ImportInventoryCatalogState {
  return {
    description: `Open Foliole in the desktop app to load ${catalogName}.`,
    title: 'Available in the desktop app'
  };
}
