export class CompanionSelectionRefreshError extends Error {
  constructor(readonly retryRefresh: () => Promise<unknown>) {
    super('companion_selection_saved_refresh_failed');
    this.name = 'CompanionSelectionRefreshError';
  }
}
