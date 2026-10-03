import type { CompanionContentAcknowledgement } from './companionContentEditContract';

export class ContentSavedRefreshError extends Error {
  constructor(readonly acknowledgement: CompanionContentAcknowledgement,
    readonly refresh: () => Promise<unknown>) {
    super('The topic was saved, but could not be refreshed.');
    this.name = 'ContentSavedRefreshError';
  }
}
