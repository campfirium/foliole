import type { EditorDocumentChangeMeta } from './codeMirrorEditorAdapterSupport';

export interface EditorExternalChangeBufferArgs {
  flushDelayMs?: number;
  getCurrentContent: () => string;
  getCurrentNodeId: () => string | null;
  isApplyingExternalContent: () => boolean;
  onFlush: (content: string, nodeId: string | null) => void;
}

export class EditorExternalChangeBuffer {
  private pendingChange: { content: string; nodeId: string | null } | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly args: EditorExternalChangeBufferArgs) {}

  destroy() {
    this.clearTimer();
  }

  handleDocumentChange(content: string, meta: EditorDocumentChangeMeta) {
    this.pendingChange = { content, nodeId: meta.nodeId };
    if (meta.isComposing) {
      this.clearTimer();
      return;
    }

    this.scheduleFlush();
  }

  handleCompositionEnd() {
    if (this.pendingChange === null || this.args.isApplyingExternalContent()) {
      return;
    }
    if (this.pendingChange.nodeId === this.args.getCurrentNodeId()) {
      this.pendingChange = { ...this.pendingChange, content: this.args.getCurrentContent() };
    }
    this.scheduleFlush();
  }

  private scheduleFlush() {
    this.clearTimer();
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.flush();
    }, this.args.flushDelayMs ?? 0);
  }

  private clearTimer() {
    if (this.pendingTimer === null) {
      return;
    }
    clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  private flush() {
    if (this.pendingChange === null || this.args.isApplyingExternalContent()) {
      return;
    }

    const nextChange = this.pendingChange;
    this.pendingChange = null;
    this.args.onFlush(nextChange.content, nextChange.nodeId);
  }
}
