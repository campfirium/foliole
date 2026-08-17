export function createWorkspaceHistoryMutationTimestamp(previous?: string | null) {
  const previousMs = previous ? Date.parse(previous) : Number.NaN;
  const nextMs = Math.max(Date.now(), Number.isFinite(previousMs) ? previousMs + 1 : 0);
  return new Date(nextMs).toISOString();
}
