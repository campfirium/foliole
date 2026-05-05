import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { bypassAnchorStructureGuard } from './anchorStructureGuard';
import { createCodeMirrorEditorExtensions } from './codeMirrorEditorAdapterConfig';
import {
  dispatchReadOnlyReconfigure,
  RemoteImageLocalizationController,
  dispatchLiveMarkdownReconfigure,
  type CodeMirrorEditorAdapterOptions
} from './codeMirrorEditorAdapterSupport';
import {
  alignSelectionInViewport,
  readEditorScrollMetrics,
  reconfigureDecorationCompartment,
  resolveDocumentPositionAtViewportY,
  subscribeToEditorScroll
} from './codeMirrorEditorAdapterView';
import { createCodeMirrorSelection, toEditorSelectionRanges } from './codeMirrorSelectionRanges';
import type {
  EditorAdapter,
  EditorScrollMetrics,
  EditorSearchDecorations,
  EditorSelection
} from './EditorAdapter';
import { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';
import { buildEditorDiffDecorations } from './lineDiffDecorations';
import { buildEditorSearchDecorations } from './searchDecorations';
export class CodeMirrorEditorAdapter implements EditorAdapter {
  private diffDecorationsCompartment = new Compartment();
  private isApplyingExternalContent = false;
  private imageClozePresentationVersion = 0;
  private hiddenTextAnchorKeys: readonly string[] = [];
  private liveMarkdownCompartment = new Compartment();
  private nodeId: string | null = null;
  private onChange?: (content: string) => void;
  private onOpenNodeLink: ((title: string) => void) | null = null;
  private readOnlyCompartment = new Compartment();
  private searchDecorationsCompartment = new Compartment();
  private remoteImageLocalization = new RemoteImageLocalizationController({
    applyLocalizedContent: (localized) => {
      this.setContent(localized);
      this.onChange?.(localized);
    },
    getContent: () => this.getContent(),
    getNodeId: () => this.nodeId
  });
  private externalChangeBuffer = new EditorExternalChangeBuffer({
    getCurrentContent: () => this.getContent(),
    isApplyingExternalContent: () => this.isApplyingExternalContent,
    onFlush: (content) => {
      if (!this.onChange) {
        return;
      }
      this.onChange(content);
      this.remoteImageLocalization.schedule();
    }
  });
  private view: EditorView;
  private hideTitleHeading = false;

  constructor(host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
    this.hideTitleHeading = options.hideTitleHeading === true;
    this.hiddenTextAnchorKeys = options.hiddenTextAnchorKeys ?? [];
    this.onChange = options.onChange;
    this.onOpenNodeLink = options.onOpenNodeLink ?? null;
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: options.initialContent,
        extensions: createCodeMirrorEditorExtensions({
          diffDecorationsCompartment: this.diffDecorationsCompartment,
          hiddenTextAnchorKeys: this.hiddenTextAnchorKeys,
          hideTitleHeading: this.hideTitleHeading,
          imageClozePresentationVersion: this.imageClozePresentationVersion,
          liveMarkdownCompartment: this.liveMarkdownCompartment,
          nodeId: this.nodeId,
          onCompositionEnd: () => this.externalChangeBuffer.handleCompositionEnd(),
          onDocChanged: (content, meta) => {
            if (!this.onChange || this.isApplyingExternalContent) {
              return;
            }
            this.externalChangeBuffer.handleDocumentChange(content, meta);
          },
          options,
          readOnlyCompartment: this.readOnlyCompartment,
          searchDecorationsCompartment: this.searchDecorationsCompartment
        })
      })
    });
  }

  destroy() {
    this.externalChangeBuffer.destroy();
    this.remoteImageLocalization.destroy();
    this.view.destroy();
  }
  focus() { this.view.focus(); }
  getContent() { return this.view.state.doc.toString(); }
  getDocumentPositionAtViewportY(clientY: number) { return resolveDocumentPositionAtViewportY(this.view, clientY); }
  revealPosition(position: number) {
    const anchor = this.clampPosition(position);
    this.view.dispatch({
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    });
    this.view.focus();
    alignSelectionInViewport(this.view, anchor);
  }

  setContent(content: string) {
    const currentContent = this.getContent();
    if (currentContent === content) {
      return;
    }
    this.isApplyingExternalContent = true;
    try {
      this.view.dispatch({
        annotations: bypassAnchorStructureGuard.of(true),
        changes: { from: 0, to: currentContent.length, insert: content }
      });
    } finally {
      this.isApplyingExternalContent = false;
    }
  }

  setHideTitleHeading(hideTitleHeading: boolean) {
    this.hideTitleHeading = hideTitleHeading;
    this.reconfigureLiveMarkdown();
  }
  setReadOnly(readOnly: boolean) {
    dispatchReadOnlyReconfigure({
      compartment: this.readOnlyCompartment,
      readOnly,
      view: this.view
    });
  }
  setNodeId(nodeId: string | null) {
    this.nodeId = nodeId;
    this.reconfigureLiveMarkdown();
    this.remoteImageLocalization.schedule();
  }

  refreshImageClozePresentation() {
    this.imageClozePresentationVersion += 1;
    this.reconfigureLiveMarkdown();
  }
  setHiddenTextAnchorKeys(hiddenTextAnchorKeys: readonly string[]) {
    if (
      this.hiddenTextAnchorKeys.length === hiddenTextAnchorKeys.length &&
      this.hiddenTextAnchorKeys.every((key, index) => key === hiddenTextAnchorKeys[index])
    ) {
      return;
    }
    this.hiddenTextAnchorKeys = [...hiddenTextAnchorKeys];
    this.reconfigureLiveMarkdown();
  }
  getSelection(): EditorSelection {
    const { from, to } = this.view.state.selection.main;
    return { from, to };
  }

  getSelectionRanges(): EditorSelection[] { return toEditorSelectionRanges(this.view.state.selection); }
  setSelection(selection: EditorSelection) {
    this.setSelectionRanges([selection]);
  }
  setSelectionRanges(selections: EditorSelection[]) {
    this.view.dispatch({
      selection: createCodeMirrorSelection(selections, (position) => this.clampPosition(position)),
      scrollIntoView: false
    });
  }

  revealSelection(selection: EditorSelection) {
    const anchor = this.clampPosition(selection.from);
    const head = this.clampPosition(selection.to);
    this.view.dispatch({
      selection: { anchor, head },
      scrollIntoView: true
    });
    this.view.focus();
    alignSelectionInViewport(this.view, anchor);
  }

  restoreSelection(selection: EditorSelection) {
    const anchor = this.clampPosition(selection.from);
    const head = this.clampPosition(selection.to);
    this.view.dispatch({
      selection: { anchor, head },
      scrollIntoView: true
    });
  }

  private clampPosition(position: number) {
    const max = this.view.state.doc.length;
    return Math.max(0, Math.min(position, max));
  }

  getScrollTop() {
    return this.view.scrollDOM.scrollTop;
  }
  getLineBlockHeight(lineNumber: number) {
    if (lineNumber < 1 || lineNumber > this.view.state.doc.lines) {
      return 0;
    }
    const line = this.view.state.doc.line(lineNumber);
    return this.view.lineBlockAt(line.from).height;
  }

  setScrollTop(scrollTop: number) {
    if (!Number.isFinite(scrollTop)) {
      return;
    }
    this.view.scrollDOM.scrollTop = Math.max(0, scrollTop);
  }

  getScrollMetrics(): EditorScrollMetrics {
    return readEditorScrollMetrics(this.view);
  }

  replaceSelection(content: string) {
    const { from, to } = this.view.state.selection.main;
    this.replaceRange(from, to, content);
  }

  replaceRange(from: number, to: number, content: string) {
    const clampedFrom = this.clampPosition(from);
    const clampedTo = this.clampPosition(to);
    this.view.dispatch({
      annotations: bypassAnchorStructureGuard.of(true),
      changes: { from: clampedFrom, to: clampedTo, insert: content },
      selection: { anchor: clampedFrom + content.length }
    });
  }

  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null) {
    reconfigureDecorationCompartment({
      buildDecorations: () => EditorView.decorations.of(buildEditorDiffDecorations(this.view, diffDecorations)),
      compartment: this.diffDecorationsCompartment,
      fallbackLabel: '[editor] failed to apply diff decorations, falling back to plain view',
      view: this.view
    });
  }

  setSearchDecorations(searchDecorations: EditorSearchDecorations | null) {
    reconfigureDecorationCompartment({
      buildDecorations: () => EditorView.decorations.of(buildEditorSearchDecorations(this.view, searchDecorations)),
      compartment: this.searchDecorationsCompartment,
      fallbackLabel: '[editor] failed to apply search decorations, falling back to plain view',
      view: this.view
    });
  }
  onContentChange(listener: (content: string) => void) {
    this.onChange = listener;
    return () => {
      this.onChange = undefined;
    };
  }

  onScroll(listener: () => void) { return subscribeToEditorScroll(this.view, listener); }
  private reconfigureLiveMarkdown() {
    dispatchLiveMarkdownReconfigure({
      compartment: this.liveMarkdownCompartment,
      hiddenTextAnchorKeys: this.hiddenTextAnchorKeys,
      hideTitleHeading: this.hideTitleHeading,
      imageClozePresentationVersion: this.imageClozePresentationVersion,
      nodeId: this.nodeId,
      onOpenNodeLink: this.onOpenNodeLink,
      view: this.view
    });
  }
}
