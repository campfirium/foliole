import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import {
  applyAdapterTextAnchorDecorations,
  reconfigureAdapterLiveMarkdownState
} from './codeMirrorEditorAdapterPresentation';
import { createCodeMirrorEditorAdapterRuntime } from './codeMirrorEditorAdapterRuntime';
import {
  dispatchReadOnlyReconfigure,
  RemoteImageLocalizationController,
  type CodeMirrorEditorAdapterOptions
} from './codeMirrorEditorAdapterSupport';
import {
  isPositionNearViewportRatio,
  resolvePositionViewportTop,
  readEditorScrollMetrics,
  revealEditorPosition,
  resolveDocumentPositionAtViewportY,
  subscribeToEditorScroll
} from './codeMirrorEditorAdapterView';
import {
  applyDiffDecorations,
  applyExternalEditorContent,
  applySearchDecorations,
  replaceEditorRange
} from './codeMirrorEditorMutations';
import { clampEditorPosition } from './codeMirrorEditorPosition';
import { getEditorLineBlockHeight, setEditorScrollTop } from './codeMirrorEditorViewport';
import { applyParagraphMarkerState } from './codeMirrorParagraphMarkerState';
import {
  restoreEditorSelection,
  revealEditorSelection,
  revealEditorSelectionCentered,
  revealEditorSelectionNearest
} from './codeMirrorSelectionActions';
import { createCodeMirrorSelection, toEditorSelectionRanges } from './codeMirrorSelectionRanges';
import { resolvePrimaryVisiblePosition } from './codeMirrorVisiblePosition';
import {
  EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS,
  type EditorTextAnchorDecoration,
  type EditorAdapter,
  type EditorRevealOptions,
  type EditorScrollMetrics,
  type EditorSearchDecorations,
  type EditorSelection
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
  private onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | null = null;
  private onOpenNodeLink: ((title: string) => void) | null = null;
  private onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | null = null;
  private onPastedAnchors: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null = null;
  private paragraphMarkerCompartment = new Compartment();
  private readOnlyCompartment = new Compartment();
  private searchDecorationsCompartment = new Compartment();
  private textAnchorDecorationsCompartment = new Compartment();
  private remoteImageLocalization: RemoteImageLocalizationController;
  private externalChangeBuffer: EditorExternalChangeBuffer;
  private view: EditorView;
  private hideTitleHeading = false;
  private textAnchorDecorations: readonly EditorTextAnchorDecoration[];

  constructor(private readonly host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
    this.hideTitleHeading = options.hideTitleHeading === true;
    this.textAnchorDecorations = options.textAnchorDecorations ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
    this.onChange = options.onChange;
    this.onOpenExternalLink = options.onOpenExternalLink ?? null;
    this.onOpenNodeLink = options.onOpenNodeLink ?? null;
    this.onPreviewNodeLink = options.onPreviewNodeLink ?? null;
    this.onPastedAnchors = options.onPastedAnchors ?? null;
    const runtime = createCodeMirrorEditorAdapterRuntime({
      diffDecorationsCompartment: this.diffDecorationsCompartment,
      getContent: () => this.getContent(),
      getNodeId: () => this.nodeId,
      getOnChange: () => this.onChange,
      hideTitleHeading: this.hideTitleHeading,
      host,
      imageClozePresentationVersion: this.imageClozePresentationVersion,
      isApplyingExternalContent: () => this.isApplyingExternalContent,
      liveMarkdownCompartment: this.liveMarkdownCompartment,
      liveMarkdownStateCompartment: this.liveMarkdownStateCompartment,
      onOpenNodeLink: this.onOpenNodeLink,
      onPreviewNodeLink: this.onPreviewNodeLink,
      onPastedAnchors: this.onPastedAnchors,
      onSetContent: (content) => this.setContent(content),
      options,
      paragraphMarkerCompartment: this.paragraphMarkerCompartment,
      readOnlyCompartment: this.readOnlyCompartment,
      searchDecorationsCompartment: this.searchDecorationsCompartment,
      textAnchorDecorations: this.textAnchorDecorations,
      textAnchorDecorationsCompartment: this.textAnchorDecorationsCompartment
    });
    this.externalChangeBuffer = runtime.externalChangeBuffer;
    this.remoteImageLocalization = runtime.remoteImageLocalization;
    this.view = runtime.view;
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
  getPositionViewportTop(position: number) {
    return resolvePositionViewportTop(this.view, this.clampPosition(position))?.viewportTop ?? null;
  }
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
  setTextAnchorDecorations(textAnchorDecorations: readonly EditorTextAnchorDecoration[]) {
    this.textAnchorDecorations = textAnchorDecorations;
    applyAdapterTextAnchorDecorations({
      compartment: this.textAnchorDecorationsCompartment,
      textAnchorDecorations,
      view: this.view
    });
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
  revealSelection(selection: EditorSelection, options?: EditorRevealOptions) {
    revealEditorSelection(this.view, selection, (position) => this.clampPosition(position), undefined, options);
  }
  revealSelectionCentered(selection: EditorSelection, options?: EditorRevealOptions) {
    revealEditorSelectionCentered(this.view, selection, (position) => this.clampPosition(position), options);
  }
  revealSelectionNearest(selection: EditorSelection, options?: EditorRevealOptions) {
    revealEditorSelectionNearest(this.view, selection, (position) => this.clampPosition(position), options);
  }
  revealSelectionAtViewportRatio(selection: EditorSelection, ratio: number, options?: EditorRevealOptions) {
    revealEditorSelection(this.view, selection, (position) => this.clampPosition(position), ratio, options);
  }
  restoreSelection(selection: EditorSelection, options?: EditorRevealOptions) {
    restoreEditorSelection(this.view, selection, (position) => this.clampPosition(position), options);
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
  private reconfigureLiveMarkdown() {
    reconfigureAdapterLiveMarkdownState({
      liveMarkdownStateCompartment: this.liveMarkdownStateCompartment,
      textAnchorDecorations: this.textAnchorDecorations,
      hideTitleHeading: this.hideTitleHeading,
      imageClozePresentationVersion: this.imageClozePresentationVersion,
      nodeId: this.nodeId,
      onOpenExternalLink: this.onOpenExternalLink,
      onOpenNodeLink: this.onOpenNodeLink,
      onPreviewNodeLink: this.onPreviewNodeLink,
      onPastedAnchors: this.onPastedAnchors,
      view: this.view
    });
  }
}
