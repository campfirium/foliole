import type { ContentImageReference } from '../../../../../lib/core/sync/localContentEditResources';
import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { createCompanionUuid } from '../../companionUuid';

import type { CompanionContentAcknowledgement, CompanionContentEdit, CompanionContentSaveHandler, CompanionContentSource } from './companionContentEditContract';
import { ContentDraftBaseHold } from './contentDraftBaseHold';
import { ContentDraftHistory } from './contentDraftHistory';
import { ContentSavedRefreshError } from './contentSavedRefreshError';

export class ContentDraftSession {
  private history = new ContentDraftHistory();
  value: string;
  reveal: string | null | undefined;
  error: string | null = null;
  ready: boolean;
  /** Counts content adopted from versions this session did not submit. */
  foreignAdoptions = 0;
  private imageReferences = new Map<string, ContentImageReference>();
  private sequence = 0;
  private acknowledged = 0;
  private pending: (CompanionContentEdit & { sequence: number }) | null = null;
  private refreshSaved: (() => Promise<unknown>) | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private refreshSequence = 0;
  private listeners = new Set<() => void>();
  private baseHold: ContentDraftBaseHold;
  private starting: Promise<void> | null = null;
  private bufferedInput = new Set<'content' | 'reveal'>();

  constructor(readonly nodeId: string, private base: CompanionContentSource,
    public save: CompanionContentSaveHandler, private delay = 0) {
    this.value = base.content;
    this.baseHold = new ContentDraftBaseHold(nodeId, () => this.save);
    this.reveal = base.reveal;
    this.ready = !save.retainHold;
  }

  get dirty() { return this.bufferedInput.size > 0 || this.sequence > this.acknowledged || Boolean(this.refreshSaved); }
  get attached() { return this.listeners.size > 0; }

  markBufferedInput(field: 'content' | 'reveal' = 'content') {
    if (!this.ready) return;
    this.bufferedInput.add(field);
    this.clearTimer();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private publish() { for (const listener of this.listeners) listener(); }

  start() {
    if (this.ready) return Promise.resolve();
    this.starting ??= this.acquireInitialBase().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async acquireInitialBase() {
    try {
      const holdId = `companion:${createCompanionUuid()}`;
      const source = await this.save.readSource(this.nodeId, holdId);
      this.baseHold.id = holdId;
      this.base = source;
      this.value = source.content;
      this.reveal = source.reveal;
      this.error = null;
      this.ready = true;
      this.publish();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not open this topic.';
      this.publish();
      throw error;
    }
  }

  async dispose() {
    if (this.dirty || this.attached || this.running) return;
    await this.baseHold.release();
  }

  async refresh(ownedVersionId?: string) {
    if (!this.ready) return;
    const request = ++this.refreshSequence;
    const sequence = this.sequence;
    if (this.dirty || this.running) return;
    try {
      const source = await this.save.readSource(this.nodeId);
      if (request !== this.refreshSequence || sequence !== this.sequence || this.dirty || this.running) return;
      const nextHoldId = this.baseHold.id && source.versionId !== this.base.versionId
        ? await this.baseHold.stage(source.versionId) : null;
      if (request !== this.refreshSequence || sequence !== this.sequence || this.dirty || this.running) {
        if (nextHoldId) await this.baseHold.release(nextHoldId);
        return;
      }
      if (source.versionId !== this.base.versionId && source.versionId !== ownedVersionId) this.foreignAdoptions += 1;
      this.base = source;
      this.value = source.content;
      this.reveal = source.reveal;
      this.publish();
      await this.baseHold.replace(nextHoldId);
    } catch {
      // A failed refresh must not replace the last known content or an unsaved draft.
    }
  }

  change(value: string, references: readonly ContentImageReference[] = [], entries?: Parameters<ContentDraftHistory['record']>[2]) {
    if (!this.ready) return;
    for (const reference of references) {
      if (!this.imageReferences.has(reference.storage_key)) this.imageReferences.set(reference.storage_key, reference);
    }
    this.bufferedInput.delete('content');
    if (value === this.value) {
      if (this.dirty) this.scheduleSave();
      return;
    }
    this.value = value;
    this.sequence += 1;
    this.history.record(this.sequence, 'content', entries);
    this.publish();
    this.scheduleSave();
  }

  changeReveal(reveal: string | null, references: readonly ContentImageReference[] = [], entries?: Parameters<ContentDraftHistory['record']>[2]) {
    if (!this.ready) return;
    this.bufferedInput.delete('reveal');
    for (const reference of references) this.imageReferences.set(reference.storage_key, reference);
    if (reveal === this.reveal) {
      if (this.dirty) this.scheduleSave();
      return;
    }
    this.reveal = reveal;
    this.sequence += 1;
    this.history.record(this.sequence, 'reveal', entries);
    this.publish();
    this.scheduleSave();
  }

  private scheduleSave() {
    this.clearTimer();
    if (this.delay === 0) void this.flush(false).catch(() => undefined);
    else this.timer = setTimeout(() => { void this.flush(false).catch(() => undefined); }, this.delay);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async flush(explicit = true) {
    if (!this.ready) await this.start();
    this.clearTimer();
    if (this.refreshSaved) {
      await this.refreshSaved();
      this.refreshSaved = null;
      this.error = null;
      this.publish();
    }
    const target = this.sequence;
    while (this.acknowledged < target) {
      if (!explicit && this.bufferedInput.size > 0) return;
      if (!this.running) this.running = this.commit().finally(() => { this.running = null; });
      await this.running;
    }
    await this.refresh();
  }

  private async commit() {
    const edit = this.pending ?? {
      newImageReferences: [...this.imageReferences.values()],
      historyTransactions: this.history.through(this.sequence),
      baseContent: this.base.content,
      ...(this.reveal === undefined ? {} : { reveal: this.reveal }),
      nodeId: this.nodeId, content: this.value, baseVersionId: this.base.versionId,
      ...(this.baseHold.id ? { holdId: this.baseHold.id } : {}),
      versionId: createOpaqueVersionRef(createCompanionUuid()),
      updatedAt: new Date().toISOString(), sequence: this.sequence
    };
    this.pending = edit;
    try {
      const ack = await this.save(this.nodeId, edit.content, edit).catch((error: unknown) => {
        if (!(error instanceof ContentSavedRefreshError)) throw error;
        this.refreshSaved = error.refresh;
        return error.acknowledgement;
      });
      await this.acknowledge(edit, ack);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save this topic.';
      this.publish();
      throw error;
    }
  }

  private async acknowledge(edit: CompanionContentEdit & { sequence: number }, ack: CompanionContentAcknowledgement) {
    const acknowledged = { content: ack.content, versionId: ack.currentVersionId,
      ...(edit.reveal === undefined ? {} : { reveal: ack.reveal === undefined ? edit.reveal : ack.reveal }) };
    const submitted = { content: edit.content, versionId: ack.submittedVersionId,
      ...(edit.reveal === undefined ? {} : { reveal: edit.reveal }) };
    if (ack.currentVersionId !== ack.submittedVersionId) this.foreignAdoptions += 1;
    this.acknowledged = edit.sequence;
    this.history.acknowledge(edit.sequence);
    this.pending = null;
    this.error = null;
    if (this.sequence === edit.sequence && this.bufferedInput.size === 0) {
      let nextHoldId: string | null = null;
      try {
        nextHoldId = this.baseHold.id && ack.currentVersionId !== ack.submittedVersionId
          ? await this.baseHold.stage(ack.currentVersionId) : null;
        if (this.sequence === edit.sequence && this.bufferedInput.size === 0) {
          this.base = acknowledged;
          this.value = ack.content;
          this.reveal = acknowledged.reveal;
          await this.baseHold.replace(nextHoldId);
        }
        else if (nextHoldId) await this.baseHold.release(nextHoldId);
      } catch {
        // The committed input remains protected; a later refresh may adopt the merged head.
      }
    }
    if (this.sequence === edit.sequence && this.bufferedInput.size === 0) {
      if (!this.baseHold.id || ack.currentVersionId === ack.submittedVersionId ||
          this.baseHold.id !== edit.holdId) {
        this.base = acknowledged;
        this.value = ack.content;
        this.reveal = acknowledged.reveal;
      } else {
        this.base = submitted;
        this.value = edit.content;
        this.reveal = submitted.reveal;
      }
    } else {
      this.base = submitted;
    }
    this.publish();
    if (this.refreshSaved) throw new Error('The topic was saved, but could not be refreshed.');
  }

}
