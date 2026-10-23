import { collectArticleImageStorageKeys } from '../../../../../lib/core/import/replaceArticleImageSource';
import type { ContentImageReference } from '../../../../../lib/core/sync/localContentEditResources';

import type { ContentDraftSession } from './contentDraftSession';

export type ContentEditRevertResult = 'unchanged' | 'reverted' | 'blocked';

interface RoundEntry {
  content: string;
  foreignAdoptions: number;
  imageReferences: ContentImageReference[] | null;
}

/** One editing round; cancelling restores the entry content as a new edit unless other changes were adopted meanwhile. */
export class ContentEditRound {
  private armed = false;
  private entry: RoundEntry | null = null;
  private images: Promise<void> | null = null;

  constructor(private readonly session: ContentDraftSession) {}

  begin() {
    this.armed = true;
    this.entry = null;
    this.capture();
  }

  /** Captures the entry once the session is ready, before the first change of the round. */
  capture() {
    if (!this.armed || this.entry || !this.session.ready) return;
    const entry: RoundEntry = { content: this.session.value, foreignAdoptions: this.session.foreignAdoptions, imageReferences: null };
    this.entry = entry;
    if (!collectArticleImageStorageKeys(entry.content).length) {
      entry.imageReferences = [];
      return;
    }
    this.images = this.session.save.readSource(this.session.nodeId)
      .then((source) => { entry.imageReferences = source.imageReferences ?? null; })
      .catch(() => undefined);
  }

  end() {
    this.armed = false;
    this.entry = null;
    this.images = null;
  }

  hasChanges() {
    return Boolean(this.entry) && this.session.value !== this.entry!.content;
  }

  async revert(): Promise<ContentEditRevertResult> {
    await this.session.flush();
    await this.images;
    const entry = this.entry;
    if (!entry || this.session.value === entry.content) return 'unchanged';
    if (this.session.foreignAdoptions !== entry.foreignAdoptions) return 'blocked';
    const restored = this.restoredImages(entry);
    if (!restored) return 'blocked';
    this.session.change(entry.content, restored);
    await this.session.flush();
    return 'reverted';
  }

  private restoredImages(entry: RoundEntry) {
    const current = new Set(collectArticleImageStorageKeys(this.session.value));
    const missing = collectArticleImageStorageKeys(entry.content).filter((key) => !current.has(key));
    if (!missing.length) return [];
    return entry.imageReferences?.filter((reference) => missing.includes(reference.storage_key)) ?? null;
  }
}
