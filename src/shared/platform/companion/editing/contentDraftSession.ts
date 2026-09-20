import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { createCompanionUuid } from '../../companionUuid';

import type { CompanionContentEdit, CompanionContentSaveHandler, CompanionContentSource } from './companionContentEditContract';

export class ContentDraftSession {
  value: string;
  error: string | null = null;
  private sequence = 0;
  private acknowledged = 0;
  private pending: (CompanionContentEdit & { sequence: number }) | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private refreshSequence = 0;
  private listeners = new Set<() => void>();

  constructor(readonly nodeId: string, private base: CompanionContentSource,
    public save: CompanionContentSaveHandler, private delay = 1200) {
    this.value = base.content;
  }

  get dirty() { return this.sequence > this.acknowledged; }
  get attached() { return this.listeners.size > 0; }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private publish() { for (const listener of this.listeners) listener(); }

  async refresh() {
    const request = ++this.refreshSequence;
    const sequence = this.sequence;
    if (this.dirty || this.running) return;
    try {
      const source = await this.save.readSource(this.nodeId);
      if (request !== this.refreshSequence || sequence !== this.sequence || this.dirty || this.running) return;
      this.base = source;
      this.value = source.content;
      this.publish();
    } catch {
      // A failed refresh must not replace the last known content or an unsaved draft.
    }
  }

  change(value: string) {
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
    this.clearTimer();
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
      versionId: createOpaqueVersionRef(createCompanionUuid()),
      updatedAt: new Date().toISOString(), sequence: this.sequence
    };
    this.pending = edit;
    try {
      const ack = await this.save(this.nodeId, edit.content, edit);
      this.acknowledged = edit.sequence;
      this.pending = null;
      this.error = null;
      if (this.sequence === edit.sequence) {
        this.base = { content: ack.content, versionId: ack.currentVersionId };
        this.value = ack.content;
      } else {
        this.base = { content: edit.content, versionId: ack.submittedVersionId };
      }
      this.publish();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save this topic.';
      this.publish();
      throw error;
    }
  }
}
