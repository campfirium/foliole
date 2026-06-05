export type ImportInventoryLoadIssue =
  | { kind: 'failed'; message: string }
  | { kind: 'unavailable' };

export type ImportInventoryCatalogState = {
  description: string;
  title: string;
};

export function createImportInventoryErrorState(input: {
  issue: Extract<ImportInventoryLoadIssue, { kind: 'failed' }>;
  onRetry: () => void;
  title: string;
}) {
  return {
    description: input.issue.message,
    onRetry: input.onRetry,
    title: input.title
  };
}

export function createImportInventoryUnavailableState(input: { description: string; title: string }): ImportInventoryCatalogState {
  return {
    description: input.description,
    title: input.title
  };
}
