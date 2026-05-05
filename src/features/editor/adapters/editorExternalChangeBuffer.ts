import type { EditorDocumentChangeMeta } from './codeMirrorEditorAdapterSupport';

export interface EditorExternalChangeBufferArgs {
  flushDelayMs?: number;
  getCurrentContent: () => string;
  isApplyingExternalContent: () => boolean;
  onFlush: (content: string) => void;
}

export class EditorExternalChangeBuffer {
  private pendingContent: string | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly args: EditorExternalChangeBufferArgs) {}

  destroy() {
    this.clearTimer();
  }

  handleDocumentChange(content: string, meta: EditorDocumentChangeMeta) {
    this.pendingContent = content;
    if (meta.isComposing) {
      this.clearTimer();
      return;
    }

    this.scheduleFlush();
  }

  handleCompositionEnd() {
    if (this.pendingContent === null || this.args.isApplyingExternalContent()) {
      return;
    }
    this.pendingContent = this.args.getCurrentContent();
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
    if (this.pendingContent === null || this.args.isApplyingExternalContent()) {
      return;
    }

    const nextContent = this.pendingContent;
    this.pendingContent = null;
    this.args.onFlush(nextContent);
  }
}
