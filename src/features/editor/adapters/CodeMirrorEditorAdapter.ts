import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  syncEditorLiveMarkdownState,
  syncEditorTextAnchorPresentation
} from './codeMirrorEditorAdapterState';
import {
  dispatchReadOnlyReconfigure,
  RemoteImageLocalizationController,
  type CodeMirrorEditorAdapterOptions
} from './codeMirrorEditorAdapterSupport';
import {
  isPositionNearViewportRatio,
  readEditorScrollMetrics,
  revealEditorPosition,
  resolveDocumentPositionAtViewportY,
  subscribeToEditorScroll
} from './codeMirrorEditorAdapterView';
import { createCodeMirrorEditorControllers } from './codeMirrorEditorControllers';
import {
  applyDiffDecorations,
  applyExternalEditorContent,
  applySearchDecorations,
  replaceEditorRange
} from './codeMirrorEditorMutations';
import { clampEditorPosition } from './codeMirrorEditorPosition';
import { getEditorLineBlockHeight, setEditorScrollTop } from './codeMirrorEditorViewport';
import { applyParagraphMarkerState } from './codeMirrorParagraphMarkerState';
import { restoreEditorSelection, revealEditorSelection } from './codeMirrorSelectionActions';
import { createCodeMirrorSelection, toEditorSelectionRanges } from './codeMirrorSelectionRanges';
import { shouldReconfigureForTextAnchorPresentation } from './codeMirrorTextAnchorPresentation';
import { resolvePrimaryVisiblePosition } from './codeMirrorVisiblePosition';
import { createCodeMirrorEditorView } from './createCodeMirrorEditorView';
import {
  EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION,
  type EditorAdapter,
  type EditorScrollMetrics,
  type EditorSearchDecorations,
  type EditorSelection,
  type EditorTextAnchorPresentation
} from './EditorAdapter';
import { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';
export class CodeMirrorEditorAdapter implements EditorAdapter {
  private diffDecorationsCompartment = new Compartment();
  private isApplyingExternalContent = false;
  private imageClozePresentationVersion = 0;
  private liveMarkdownCompartment = new Compartment();
  private liveMarkdownStateCompartment = new Compartment();
  private nodeId: string | null = null;
  private onChange?: (content: string) => void;
  private onOpenNodeLink: ((title: string) => void) | null = null;
  private onPastedAnchors: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null = null;
  private paragraphMarkerCompartment = new Compartment();
  private readOnlyCompartment = new Compartment();
  private searchDecorationsCompartment = new Compartment();
  private textAnchorDecorationsCompartment = new Compartment();
  private remoteImageLocalization: RemoteImageLocalizationController;
  private externalChangeBuffer: EditorExternalChangeBuffer;
  private view: EditorView;
  private hideTitleHeading = false;
  private textAnchorPresentation: EditorTextAnchorPresentation;
  private readonly host: HTMLElement;
  constructor(host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
    this.host = host;
    this.hideTitleHeading = options.hideTitleHeading === true;
    this.textAnchorPresentation = options.textAnchorPresentation ?? EMPTY_EDITOR_TEXT_ANCHOR_PRESENTATION;
    this.onChange = options.onChange;
    this.onOpenNodeLink = options.onOpenNodeLink ?? null;
    this.onPastedAnchors = options.onPastedAnchors ?? null;
    const controllers = createCodeMirrorEditorControllers({
      applyLocalizedContent: (localized) => {
        this.setContent(localized);
        this.onChange?.(localized);
      },
      getContent: () => this.getContent(),
      getNodeId: () => this.nodeId,
      isApplyingExternalContent: () => this.isApplyingExternalContent,
      onFlush: (content) => {
        if (!this.onChange) {
          return;
        }
        this.onChange(content);
        this.remoteImageLocalization.schedule();
      }
    });
    this.externalChangeBuffer = controllers.externalChangeBuffer;
    this.remoteImageLocalization = controllers.remoteImageLocalization;
    this.view = createCodeMirrorEditorView({
      diffDecorationsCompartment: this.diffDecorationsCompartment,
      textAnchorPresentation: this.textAnchorPresentation,
      hideTitleHeading: this.hideTitleHeading,
      host,
      imageClozePresentationVersion: this.imageClozePresentationVersion,
      liveMarkdownCompartment: this.liveMarkdownCompartment,
      liveMarkdownStateCompartment: this.liveMarkdownStateCompartment,
      nodeId: this.nodeId,
      onCompositionEnd: () => this.externalChangeBuffer.handleCompositionEnd(),
      onDocChanged: (content, meta) => {
        if (!this.onChange || this.isApplyingExternalContent) {
          return;
        }
        this.externalChangeBuffer.handleDocumentChange(content, meta);
      },
      options,
      paragraphMarkerCompartment: this.paragraphMarkerCompartment,
      readOnlyCompartment: this.readOnlyCompartment,
      searchDecorationsCompartment: this.searchDecorationsCompartment,
      textAnchorDecorationsCompartment: this.textAnchorDecorationsCompartment
    });
  }
  destroy() {
    this.externalChangeBuffer.destroy();
    this.remoteImageLocalization.destroy();
    delete this.host.dataset.paragraphMarkerActive;
    this.view.destroy();
  }
  focus() { this.view.focus(); }
  getContent() { return this.view.state.doc.toString(); }
  getDocumentPositionAtViewportY(clientY: number) { return resolveDocumentPositionAtViewportY(this.view, clientY); }
  getPrimaryVisiblePosition() { return resolvePrimaryVisiblePosition(this.view); }
  isPositionNearViewportRatio(position: number, ratio: number, toleranceRatio?: number) {
    return isPositionNearViewportRatio(this.view, this.clampPosition(position), ratio, toleranceRatio);
  }
  getViewportRect() { return this.view.scrollDOM.getBoundingClientRect(); }
  setParagraphMarker(selection: EditorSelection | null) { applyParagraphMarkerState({ compartment: this.paragraphMarkerCompartment, selection, view: this.view }); }
  revealPosition(position: number) {
    const anchor = this.clampPosition(position);
    revealEditorPosition(this.view, anchor);
  }
  setContent(content: string) {
    const currentContent = this.getContent();
    if (currentContent === content) {
      return;
    }
    this.isApplyingExternalContent = true;
    try {
      applyExternalEditorContent({
        content,
        currentContent,
        view: this.view
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
  setTextAnchorPresentation(textAnchorPresentation: EditorTextAnchorPresentation) {
    const shouldReconfigure = shouldReconfigureForTextAnchorPresentation(
      this.textAnchorPresentation,
      textAnchorPresentation
    );
    this.textAnchorPresentation = textAnchorPresentation;
    if (shouldReconfigure) {
      this.reconfigureLiveMarkdown();
    }
    this.applyTextAnchorPresentation(textAnchorPresentation);
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
    revealEditorSelection(this.view, selection, (position) => this.clampPosition(position));
  }
  revealSelectionAtViewportRatio(selection: EditorSelection, ratio: number) {
    revealEditorSelection(this.view, selection, (position) => this.clampPosition(position), ratio);
  }
  restoreSelection(selection: EditorSelection) {
    restoreEditorSelection(this.view, selection, (position) => this.clampPosition(position));
  }
  private clampPosition(position: number) {
    return clampEditorPosition(position, this.view.state.doc.length);
  }
  getScrollTop() { return this.view.scrollDOM.scrollTop; }
  getLineBlockHeight(lineNumber: number) { return getEditorLineBlockHeight(this.view, lineNumber); }
  setScrollTop(scrollTop: number) { setEditorScrollTop(this.view, scrollTop); }
  getScrollMetrics(): EditorScrollMetrics { return readEditorScrollMetrics(this.view); }
  replaceSelection(content: string) {
    const { from, to } = this.view.state.selection.main;
    this.replaceRange(from, to, content);
  }
  replaceRange(from: number, to: number, content: string) {
    const clampedFrom = this.clampPosition(from);
    const clampedTo = this.clampPosition(to);
    replaceEditorRange({
      content,
      from: clampedFrom,
      to: clampedTo,
      view: this.view
    });
  }
  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null) {
    applyDiffDecorations({
      compartment: this.diffDecorationsCompartment,
      diffDecorations,
      view: this.view
    });
  }
  setSearchDecorations(searchDecorations: EditorSearchDecorations | null) {
    applySearchDecorations({
      compartment: this.searchDecorationsCompartment,
      searchDecorations,
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
  private applyTextAnchorPresentation(textAnchorPresentation: EditorTextAnchorPresentation) {
    syncEditorTextAnchorPresentation({ compartment: this.textAnchorDecorationsCompartment, textAnchorPresentation, view: this.view });
  }
  private reconfigureLiveMarkdown() {
    syncEditorLiveMarkdownState({
      liveMarkdownStateCompartment: this.liveMarkdownStateCompartment,
      textAnchorPresentation: this.textAnchorPresentation,
      hideTitleHeading: this.hideTitleHeading,
      imageClozePresentationVersion: this.imageClozePresentationVersion,
      nodeId: this.nodeId,
      onOpenNodeLink: this.onOpenNodeLink,
      onPastedAnchors: this.onPastedAnchors,
      view: this.view
    });
  }
}
