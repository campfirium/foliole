import { createCompanionUuid } from '../../companionUuid';

import type { CompanionContentSaveHandler } from './companionContentEditContract';

export class ContentDraftBaseHold {
  id: string | null = null;

  constructor(private readonly nodeId: string, private readonly save: () => CompanionContentSaveHandler) {}

  async stage(versionId: string) {
    const id = `companion:${createCompanionUuid()}`;
    await this.save().retainHold?.(this.nodeId, versionId, id);
    return id;
  }

  async replace(id: string | null) {
    if (!id) return;
    const previous = this.id;
    this.id = id;
    if (previous) await this.save().releaseHold?.(this.nodeId, previous);
  }

  async release(id = this.id) {
    if (!id) return;
    await this.save().releaseHold?.(this.nodeId, id);
    if (this.id === id) this.id = null;
  }
}
