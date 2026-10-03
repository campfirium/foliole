import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { createCompanionUuid } from '../../companionUuid';

import type { CompanionContentEdit, CompanionContentSaveHandler, CompanionContentSource } from './companionContentEditContract';
import { ContentSavedRefreshError } from './contentSavedRefreshError';

export class ContentDraftSession {
  value: string;
  error: string | null = null;
  ready: boolean;
  private sequence = 0;
  private acknowledged = 0;
  private pending: (CompanionContentEdit & { sequence: number }) | null = null;
  private refreshSaved: (() => Promise<unknown>) | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private refreshSequence = 0;
  private listeners = new Set<() => void>();
  private holdId: string | null = null;
  private starting: Promise<void> | null = null;

  constructor(readonly nodeId: string, private base: CompanionContentSource,
    public save: CompanionContentSaveHandler, private delay = 1200) {
    this.value = base.content;
    this.ready = !save.retainHold;
  }

  get dirty() { return this.sequence > this.acknowledged || Boolean(this.refreshSaved); }
  get attached() { return this.listeners.size > 0; }

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
      this.holdId = holdId;
      this.base = source;
      this.value = source.content;
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
    if (this.dirty || this.attached || this.running || !this.holdId) return;
    const holdId = this.holdId;
    await this.save.releaseHold?.(this.nodeId, holdId);
    if (this.holdId === holdId) this.holdId = null;
  }

  async refresh() {
    if (!this.ready) return;
    const request = ++this.refreshSequence;
    const sequence = this.sequence;
    if (this.dirty || this.running) return;
    try {
      const source = await this.save.readSource(this.nodeId);
      if (request !== this.refreshSequence || sequence !== this.sequence || this.dirty || this.running) return;
      const nextHoldId = this.holdId && source.versionId !== this.base.versionId
        ? await this.stageNextBase(source.versionId) : null;
      if (request !== this.refreshSequence || sequence !== this.sequence || this.dirty || this.running) {
        if (nextHoldId) await this.save.releaseHold?.(this.nodeId, nextHoldId);
        return;
      }
      this.base = source;
      this.value = source.content;
      this.publish();
      await this.replaceHold(nextHoldId);
    } catch {
      // A failed refresh must not replace the last known content or an unsaved draft.
    }
  }

  change(value: string) {
    if (!this.ready) return;
    if (value === this.value) return;
    this.value = value;
    this.sequence += 1;
    this.clearTimer();
    this.timer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.delay);
    this.publish();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async flush() {
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
      if (!this.running) this.running = this.commit().finally(() => { this.running = null; });
      await this.running;
    }
    await this.refresh();
  }

  private async commit() {
    const edit = this.pending ?? {
      nodeId: this.nodeId, content: this.value, baseVersionId: this.base.versionId,
      ...(this.holdId ? { holdId: this.holdId } : {}),
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
      this.acknowledged = edit.sequence;
      this.pending = null;
      this.error = null;
      if (this.sequence === edit.sequence) {
        let nextHoldId: string | null = null;
        try {
          nextHoldId = this.holdId && ack.currentVersionId !== ack.submittedVersionId
            ? await this.stageNextBase(ack.currentVersionId) : null;
          if (this.sequence === edit.sequence) {
            this.base = { content: ack.content, versionId: ack.currentVersionId };
            this.value = ack.content;
            await this.replaceHold(nextHoldId);
          }
          else if (nextHoldId) await this.save.releaseHold?.(this.nodeId, nextHoldId);
        } catch {
          // The committed input remains protected; a later refresh may adopt the merged head.
        }
      }
      if (this.sequence === edit.sequence) {
        if (!this.holdId || ack.currentVersionId === ack.submittedVersionId ||
            this.holdId !== edit.holdId) {
          this.base = { content: ack.content, versionId: ack.currentVersionId };
          this.value = ack.content;
        } else {
          this.base = { content: edit.content, versionId: ack.submittedVersionId };
          this.value = edit.content;
        }
      } else {
        this.base = { content: edit.content, versionId: ack.submittedVersionId };
      }
      this.publish();
      if (this.refreshSaved) throw new Error('The topic was saved, but could not be refreshed.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save this topic.';
      this.publish();
      throw error;
    }
  }

  private async stageNextBase(versionId: string) {
    const holdId = `companion:${createCompanionUuid()}`;
    await this.save.retainHold?.(this.nodeId, versionId, holdId);
    return holdId;
  }

  private async replaceHold(nextHoldId: string | null) {
    if (!nextHoldId) return;
    const previous = this.holdId;
    this.holdId = nextHoldId;
    if (previous) await this.save.releaseHold?.(this.nodeId, previous);
  }
}
