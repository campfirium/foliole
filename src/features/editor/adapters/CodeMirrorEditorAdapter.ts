import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import { alignScrollTopToViewportRatio } from '../model/scrollAlignment';

import { anchorStructureGuard, bypassAnchorStructureGuard } from './anchorStructureGuard';
import {
  createEmptyDecorationsEffect,
  createLiveMarkdownReconfigureEffect,
  RemoteImageLocalizationController,
  type CodeMirrorEditorAdapterOptions
} from './codeMirrorEditorAdapterSupport';
import { createCodeMirrorSelection, toEditorSelectionRanges } from './codeMirrorSelectionRanges';
import type { EditorAdapter, EditorScrollMetrics, EditorSelection } from './EditorAdapter';
import { buildEditorDiffDecorations } from './lineDiffDecorations';
import { createLiveMarkdown } from './liveMarkdown';
import { markdownInputAssist } from './markdownInputAssist';

export class CodeMirrorEditorAdapter implements EditorAdapter {
  private diffDecorationsCompartment = new Compartment();
  private isApplyingExternalContent = false;
  private imageClozePresentationVersion = 0;
  private hiddenTextAnchorKeys: readonly string[] = [];
  private liveMarkdownCompartment = new Compartment();
  private nodeId: string | null = null;
  private onChange?: (content: string) => void;
  private remoteImageLocalization = new RemoteImageLocalizationController({
    applyLocalizedContent: (localized) => {
      this.setContent(localized);
      this.onChange?.(localized);
    },
    getContent: () => this.getContent(),
    getNodeId: () => this.nodeId
  });
  private view: EditorView;
  private hideTitleHeading = false;

  constructor(host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
    this.hideTitleHeading = options.hideTitleHeading === true;
    this.hiddenTextAnchorKeys = options.hiddenTextAnchorKeys ?? [];
    this.onChange = options.onChange;
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: options.initialContent,
        extensions: [
          markdown(),
          anchorStructureGuard,
          history(),
          EditorState.allowMultipleSelections.of(true),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorState.readOnly.of(options.readOnly === true),
          // Keep the DOM selectable even in read-only panes so users can copy text from comparison views.
          EditorView.editable.of(true),
          drawSelection(),
          EditorView.lineWrapping,
          highlightActiveLine(),
          markdownInputAssist,
          this.diffDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
          this.liveMarkdownCompartment.of(
            createLiveMarkdown(
              this.hideTitleHeading,
              this.nodeId,
              this.imageClozePresentationVersion,
              this.hiddenTextAnchorKeys
            )
          ),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || !this.onChange || this.isApplyingExternalContent) {
              return;
            }
            this.onChange(update.state.doc.toString());
            this.remoteImageLocalization.schedule();
          })
        ]
      })
    });
  }

  destroy() {
    this.remoteImageLocalization.destroy();
    this.view.destroy();
  }

  focus() {
    this.view.focus();
  }

  getContent() {
    return this.view.state.doc.toString();
  }

  getDocumentPositionAtViewportY(clientY: number) {
    const contentRect = this.view.contentDOM.getBoundingClientRect();
    const x = contentRect.left + Math.min(Math.max(contentRect.width * 0.52, 160), contentRect.width - 24);
    return this.view.posAtCoords({ x, y: clientY }, false);
  }

  revealPosition(position: number) {
    const anchor = this.clampPosition(position);
    this.view.dispatch({
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    });
    this.view.focus();
    this.alignSelectionInViewport(anchor);
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
    this.view.dispatch({
        effects: createLiveMarkdownReconfigureEffect({
          compartment: this.liveMarkdownCompartment,
          hiddenTextAnchorKeys: this.hiddenTextAnchorKeys,
          hideTitleHeading: this.hideTitleHeading,
          imageClozePresentationVersion: this.imageClozePresentationVersion,
          nodeId: this.nodeId
      })
    });
  }

  setNodeId(nodeId: string | null) {
    this.nodeId = nodeId;
    this.view.dispatch({
        effects: createLiveMarkdownReconfigureEffect({
          compartment: this.liveMarkdownCompartment,
          hiddenTextAnchorKeys: this.hiddenTextAnchorKeys,
          hideTitleHeading: this.hideTitleHeading,
          imageClozePresentationVersion: this.imageClozePresentationVersion,
          nodeId: this.nodeId
      })
    });
    this.remoteImageLocalization.schedule();
  }

  refreshImageClozePresentation() {
    this.imageClozePresentationVersion += 1;
    this.view.dispatch({
        effects: createLiveMarkdownReconfigureEffect({
          compartment: this.liveMarkdownCompartment,
          hiddenTextAnchorKeys: this.hiddenTextAnchorKeys,
          hideTitleHeading: this.hideTitleHeading,
          imageClozePresentationVersion: this.imageClozePresentationVersion,
          nodeId: this.nodeId
      })
    });
  }

  setHiddenTextAnchorKeys(hiddenTextAnchorKeys: readonly string[]) {
    if (
      this.hiddenTextAnchorKeys.length === hiddenTextAnchorKeys.length &&
      this.hiddenTextAnchorKeys.every((key, index) => key === hiddenTextAnchorKeys[index])
    ) {
      return;
    }
    this.hiddenTextAnchorKeys = [...hiddenTextAnchorKeys];
    this.view.dispatch({
      effects: createLiveMarkdownReconfigureEffect({
        compartment: this.liveMarkdownCompartment,
        hiddenTextAnchorKeys: this.hiddenTextAnchorKeys,
        hideTitleHeading: this.hideTitleHeading,
        imageClozePresentationVersion: this.imageClozePresentationVersion,
        nodeId: this.nodeId
      })
    });
  }

  getSelection(): EditorSelection {
    const { from, to } = this.view.state.selection.main;
    return { from, to };
  }

  getSelectionRanges(): EditorSelection[] {
    return toEditorSelectionRanges(this.view.state.selection);
  }

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
    this.alignSelectionInViewport(anchor);
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

  private alignSelectionInViewport(position: number) {
    requestAnimationFrame(() => {
      const scroller = this.view.scrollDOM;
      const cursorRect = this.view.coordsAtPos(position) ?? this.view.coordsAtPos(position, -1);
      if (!cursorRect) {
        return;
      }

      const viewportRect = scroller.getBoundingClientRect();
      const nextScrollTop = alignScrollTopToViewportRatio({
        currentScrollTop: scroller.scrollTop,
        cursorViewportTop: cursorRect.top,
        scrollHeight: scroller.scrollHeight,
        viewportHeight: scroller.clientHeight,
        viewportTop: viewportRect.top
      });
      scroller.scrollTop = nextScrollTop;
    });
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
    const scroller = this.view.scrollDOM;
    return {
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop
    };
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
    try {
      this.view.dispatch({
        effects: this.diffDecorationsCompartment.reconfigure(EditorView.decorations.of(buildEditorDiffDecorations(this.view, diffDecorations)))
      });
    } catch (error) {
      console.error('[editor] failed to apply diff decorations, falling back to plain view', error);
      this.view.dispatch({
        effects: createEmptyDecorationsEffect(this.diffDecorationsCompartment)
      });
    }
  }

  onContentChange(listener: (content: string) => void) {
    this.onChange = listener;
    return () => {
      this.onChange = undefined;
    };
  }

  onScroll(listener: () => void) {
    const scroller = this.view.scrollDOM;
    const handleScroll = () => listener();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }
}
