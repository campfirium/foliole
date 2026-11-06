import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { EditorTextEditOperationEntry } from '../model/editorOperationHistory';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { CodeMirrorDeferredFocus } from './codeMirrorDeferredFocus';
import {
  applyCodeMirrorTextAnchorDecorationsWithPreview,
  replaceCodeMirrorRange,
  setCodeMirrorDiffDecorations,
  setCodeMirrorReadOnly,
  setCodeMirrorSearchDecorations
} from './codeMirrorEditorAdapterActions';
import { createCodeMirrorEditorAdapterRuntime } from './codeMirrorEditorAdapterRuntime';
import { RemoteImageLocalizationController, type CodeMirrorEditorAdapterOptions } from './codeMirrorEditorAdapterSupport';
import { subscribeToEditorScroll } from './codeMirrorEditorAdapterView';
import { CodeMirrorEditorNavigation } from './codeMirrorEditorNavigation';
import type { HighlightRangePreview } from './codeMirrorHighlightRangePreview';
import { reconfigureCodeMirrorLiveMarkdown } from './codeMirrorLiveMarkdownReconfigure';
import { getCodeMirrorOutline } from './codeMirrorOutline';
import { applyParagraphMarkerState } from './codeMirrorParagraphMarkerState';
import { CodeMirrorTextHistoryController } from './codeMirrorTextHistory';
import {
  EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS,
  type EditorAdapter,
  type EditorContentChangeMeta,
  type EditorSearchDecorations,
  type EditorSelection,
  type EditorTextAnchorDecoration
} from './EditorAdapter';
import { EditorBodyOverflowSignal } from './editorBodyOverflowSignal';
import { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';
import { clearRetainedRemoteImageSources } from './retainedRemoteImageDisplay';

export class CodeMirrorEditorAdapter extends CodeMirrorEditorNavigation implements EditorAdapter {
  private bodyOverflow = new EditorBodyOverflowSignal();
  private diffDecorationsCompartment = new Compartment();
  private isApplyingExternalContent = false;
  private imageClozePresentationVersion = 0;
  private liveMarkdownCompartment = new Compartment();
  private liveMarkdownStateCompartment = new Compartment();
  private localDocumentPath: string | null = null;
  private nodeId: string | null = null;
  private onChange: ((content: string, meta?: EditorContentChangeMeta) => void) | undefined;
  private onMissingAttachmentResource: NonNullable<CodeMirrorEditorAdapterOptions['onMissingAttachmentResource']> | null = null;
  private onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | null = null;
  private onOpenNodeLink: ((title: string) => void) | null = null;
  private onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | null = null;
  private onPastedAnchors: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null = null;
  private paragraphMarkerCompartment = new Compartment();
  private readOnlyCompartment = new Compartment();
  private readonly deferredFocus = new CodeMirrorDeferredFocus(() => this.view);
  private searchDecorationsCompartment = new Compartment();
  private textAnchorDecorationsCompartment = new Compartment();
  private textHistory: CodeMirrorTextHistoryController;
  private remoteImageLocalization: RemoteImageLocalizationController;
  private externalChangeBuffer: EditorExternalChangeBuffer;
  protected view: EditorView;
  private hideTitleHeading = false;
  private textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  private highlightRangePreview: HighlightRangePreview | null = null;

  constructor(private readonly host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
    super();
    this.nodeId = options.nodeId ?? null;
    this.hideTitleHeading = options.hideTitleHeading === true;
    this.localDocumentPath = options.localDocumentPath ?? null;
    this.textAnchorDecorations = options.textAnchorDecorations ?? EMPTY_EDITOR_TEXT_ANCHOR_DECORATIONS;
    this.onChange = options.onChange;
    this.onMissingAttachmentResource = options.onMissingAttachmentResource ?? null;
    this.onOpenExternalLink = options.onOpenExternalLink ?? null;
    this.onOpenNodeLink = options.onOpenNodeLink ?? null;
    this.onPreviewNodeLink = options.onPreviewNodeLink ?? null;
    this.onPastedAnchors = options.onPastedAnchors ?? null;
    this.textHistory = new CodeMirrorTextHistoryController({
      discardPending: () => this.externalChangeBuffer.discardPending(),
      focus: () => this.focus(),
      getNodeId: () => this.nodeId,
      isApplyingExternalContent: () => this.isApplyingExternalContent,
      setApplyingExternalContent: value => { this.isApplyingExternalContent = value; }
    });
    const runtime = createCodeMirrorEditorAdapterRuntime({
      textHistory: this.textHistory,
      hasBodyOverflowListener: () => this.bodyOverflow.hasListeners(),
      onBodyOverflow: (request) => this.bodyOverflow.emit(request),
      diffDecorationsCompartment: this.diffDecorationsCompartment,
      getContent: () => this.getContent(),
      getNodeId: () => this.nodeId,
      getOnChange: () => this.onChange,
      getView: () => this.view,
      hideTitleHeading: this.hideTitleHeading,
      host,
      imageClozePresentationVersion: this.imageClozePresentationVersion,
      isApplyingExternalContent: () => this.isApplyingExternalContent,
      isApplyingHistoryReplay: () => this.textHistory.isApplying(),
      liveMarkdownCompartment: this.liveMarkdownCompartment,
      liveMarkdownStateCompartment: this.liveMarkdownStateCompartment,
      onOpenNodeLink: this.onOpenNodeLink,
      onPreviewNodeLink: this.onPreviewNodeLink,
      onPastedAnchors: this.onPastedAnchors,
      setApplyingExternalContent: (value) => { this.isApplyingExternalContent = value; },
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
    this.bodyOverflow.clear();
    this.externalChangeBuffer.destroy();
    this.remoteImageLocalization.destroy();
    delete this.host.dataset.paragraphMarkerActive;
    this.view.destroy();
  }
  focus() { this.deferredFocus.request(); }
  flushContentChanges() { this.externalChangeBuffer.flushNow(); }
  getContent() { return this.view.state.doc.toString(); }
  get outline() { return getCodeMirrorOutline(this.view); }
  bindTextHistorySource(source: import('./EditorAdapter').EditorTextHistorySource) { this.textHistory.bind(source, this.view); }
  applyTextHistory(entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo', save?: import('../model/editorTextReplaySave').EditorTextReplaySave) {
    return this.textHistory.apply(entry, mode, this.view, save);
  }
  setParagraphMarker(selection: EditorSelection | null) { applyParagraphMarkerState({ compartment: this.paragraphMarkerCompartment, selection, view: this.view }); }
  setContent(content: string) {
    this.textHistory.setContent(content, this.view);
    this.remoteImageLocalization.schedule();
  }
  setHideTitleHeading(hideTitleHeading: boolean) {
    this.hideTitleHeading = hideTitleHeading;
    this.reconfigureLiveMarkdown();
  }
  setReadOnly(readOnly: boolean) {
    const retainReplayFocus = readOnly && this.view.hasFocus && this.textHistory.ownsReplayFocus(this.view);
    setCodeMirrorReadOnly(this.view, this.readOnlyCompartment, readOnly);
    if (retainReplayFocus) this.deferredFocus.request();
    this.deferredFocus.resolve();
  }
  setNodeId(nodeId: string | null) {
    if (nodeId !== this.nodeId) clearRetainedRemoteImageSources(this.nodeId);
    this.externalChangeBuffer.flushNow();
    if (nodeId !== this.nodeId) {
      this.nodeId = nodeId;
      this.textHistory.nodeChanged(this.view);
      this.reconfigureLiveMarkdown();
    }
    this.remoteImageLocalization.schedule();
  }
  setLocalDocumentPath(localDocumentPath: string | null) {
    if (this.localDocumentPath === localDocumentPath) {
      return;
    }
    this.localDocumentPath = localDocumentPath;
    this.reconfigureLiveMarkdown();
  }
  refreshImageClozePresentation() {
    this.imageClozePresentationVersion += 1;
    this.reconfigureLiveMarkdown();
  }
  setTextAnchorDecorations(textAnchorDecorations: readonly EditorTextAnchorDecoration[]) {
    this.textAnchorDecorations = textAnchorDecorations;
    this.applyTextAnchorDecorationsWithPreview();
    this.reconfigureLiveMarkdown();
  }
  setHighlightRangePreview(nodeId: string, range: EditorSelection | null) {
    this.highlightRangePreview = range ? { nodeId, range } : null;
    this.applyTextAnchorDecorationsWithPreview();
  }
  private applyTextAnchorDecorationsWithPreview() {
    applyCodeMirrorTextAnchorDecorationsWithPreview({
      compartment: this.textAnchorDecorationsCompartment,
      preview: this.highlightRangePreview,
      textAnchorDecorations: this.textAnchorDecorations,
      view: this.view
    });
  }
  replaceSelection(content: string) { const { from, to } = this.view.state.selection.main; this.replaceRange(from, to, content); }
  replaceRange(from: number, to: number, content: string, options?: import('./EditorAdapter').EditorReplaceRangeOptions) {
    replaceCodeMirrorRange({ content, from: this.clampPosition(from), ...(options ? { options } : {}), to: this.clampPosition(to), view: this.view });
  }
  setDiffDecorations(diffDecorations: import('./lineDiffDecorations').EditorDiffDecorations | null) {
    setCodeMirrorDiffDecorations({ diffDecorations, view: this.view });
  }
  setSearchDecorations(searchDecorations: EditorSearchDecorations | null) {
    setCodeMirrorSearchDecorations({ compartment: this.searchDecorationsCompartment, searchDecorations, view: this.view });
  }
  onContentChange(listener: (content: string, meta?: EditorContentChangeMeta) => void) {
    this.onChange = listener;
    return () => {
      this.onChange = undefined;
    };
  }
  onScroll(listener: Parameters<typeof subscribeToEditorScroll>[1]) { return subscribeToEditorScroll(this.view, listener); }
  onBodyOverflow(listener: (request: import('./EditorAdapter').EditorBodyOverflow) => void) {
    return this.bodyOverflow.subscribe(listener);
  }
  private reconfigureLiveMarkdown() { reconfigureCodeMirrorLiveMarkdown({ liveMarkdownStateCompartment: this.liveMarkdownStateCompartment, textAnchorDecorations: this.textAnchorDecorations, hideTitleHeading: this.hideTitleHeading, imageClozePresentationVersion: this.imageClozePresentationVersion, localDocumentPath: this.localDocumentPath, nodeId: this.nodeId, onMissingAttachmentResource: this.onMissingAttachmentResource, onOpenExternalLink: this.onOpenExternalLink, onOpenNodeLink: this.onOpenNodeLink, onPreviewNodeLink: this.onPreviewNodeLink, onPastedAnchors: this.onPastedAnchors, view: this.view }); }
}
