import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from '../../../store/workspaceEditorInputDiagnostics';

import type { EditorDocumentChangeMeta } from './codeMirrorEditorAdapterSupport';

export interface EditorExternalChangeBufferArgs {
  flushDelayMs?: number;
  getCurrentContent: () => string;
  getCurrentNodeId: () => string | null;
  isApplyingExternalContent: () => boolean;
  onFlush: (content: string, nodeId: string | null) => void;
}

export class EditorExternalChangeBuffer {
  private inputChangeSequence = 0;
  private pendingChange: { changedAtMs: number; content: string | null; nodeId: string | null; sampleId: number } | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly args: EditorExternalChangeBufferArgs) {}

  destroy() {
    this.flushNow();
    this.clearTimer();
  }

  handleDocumentChange(content: string | null, meta: EditorDocumentChangeMeta) {
    const diagnosticsEnabled = isEditorInputDiagnosticEnabled();
    const changedAtMs = diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
    const sampleId = diagnosticsEnabled ? this.inputChangeSequence + 1 : 0;
    if (diagnosticsEnabled) {
      this.inputChangeSequence = sampleId;
    }
    this.pendingChange = { changedAtMs, content, nodeId: meta.nodeId, sampleId };
    if (diagnosticsEnabled) {
      this.logInputChange({
        changedAtMs,
        contentLength: content?.length ?? meta.contentLength ?? null,
        isComposing: meta.isComposing,
        nodeId: meta.nodeId,
        sampleId
      });
    }
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

  flushNow() {
    this.clearTimer();
    this.flush();
  }

  discardPending() {
    this.clearTimer();
    this.pendingChange = null;
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
      this.capturePendingContentBeforeDeferredFlush();
      if (this.pendingChange !== null && this.args.isApplyingExternalContent()) {
        this.scheduleFlush();
      }
      return;
    }

    const nextChange = this.pendingChange;
    this.pendingChange = null;
    const flushStartedAt = readEditorInputDiagnosticTime();
    const content = this.resolveFlushContent(nextChange);
    if (content === null) {
      return;
    }
    this.args.onFlush(content, nextChange.nodeId);
    this.logInputFlush({ ...nextChange, content }, flushStartedAt);
  }

  private resolveFlushContent(change: { content: string | null; nodeId: string | null }) {
    if (change.nodeId === this.args.getCurrentNodeId()) {
      return this.args.getCurrentContent();
    }
    return change.content;
  }

  private capturePendingContentBeforeDeferredFlush() {
    const pendingChange = this.pendingChange;
    if (
      pendingChange?.content === null &&
      pendingChange.nodeId === this.args.getCurrentNodeId()
    ) {
      this.pendingChange = { ...pendingChange, content: this.args.getCurrentContent() };
    }
  }

  private logInputChange(args: {
    changedAtMs: number;
    contentLength: number | null;
    isComposing: boolean;
    nodeId: string | null;
    sampleId: number;
  }) {
    if (!isEditorInputDiagnosticEnabled()) {
      return;
    }
    logEditorInputDiagnostic('editor-input-change', {
      contentLength: args.contentLength,
      isComposing: args.isComposing,
      nodeId: args.nodeId,
      sampleId: args.sampleId
    });
    this.scheduleInputFrameDiagnostic(args);
  }

  private scheduleInputFrameDiagnostic(args: {
    changedAtMs: number;
    contentLength: number | null;
    nodeId: string | null;
    sampleId: number;
  }) {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    let secondFrameHandle = 0;
    requestAnimationFrame(() => {
      const firstFrameAt = readEditorInputDiagnosticTime();
      logEditorInputDiagnostic('editor-input-change-first-frame', {
        contentLength: args.contentLength,
        inputToFrameMs: firstFrameAt - args.changedAtMs,
        nodeId: args.nodeId,
        sampleId: args.sampleId
      });
      secondFrameHandle = requestAnimationFrame(() => {
        const secondFrameAt = readEditorInputDiagnosticTime();
        logEditorInputDiagnostic('editor-input-change-second-frame', {
          contentLength: args.contentLength,
          frameGapMs: secondFrameAt - firstFrameAt,
          inputToSecondFrameMs: secondFrameAt - args.changedAtMs,
          nodeId: args.nodeId,
          sampleId: args.sampleId
        });
      });
      void secondFrameHandle;
    });
  }

  private logInputFlush(
    change: { changedAtMs: number; content: string; nodeId: string | null; sampleId: number },
    flushStartedAt: number
  ) {
    if (!isEditorInputDiagnosticEnabled()) {
      return;
    }
    logEditorInputDiagnostic('editor-input-flush', {
      contentLength: change.content.length,
      inputToFlushMs: flushStartedAt - change.changedAtMs,
      nodeId: change.nodeId,
      sampleId: change.sampleId,
      totalMs: readEditorInputDiagnosticTime() - flushStartedAt
    });
  }
}
