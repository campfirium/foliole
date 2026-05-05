import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import { alignScrollTopToViewportRatio } from '../model/scrollAlignment';

import { anchorStructureGuard, bypassAnchorStructureGuard } from './anchorStructureGuard';
import type { EditorAdapter, EditorScrollMetrics, EditorSelection } from './EditorAdapter';
import { buildEditorDiffDecorations } from './lineDiffDecorations';
import { createLiveMarkdown } from './liveMarkdown';
import { markdownInputAssist } from './markdownInputAssist';

interface CodeMirrorEditorAdapterOptions {
  hideTitleHeading?: boolean;
  initialContent: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
}

export class CodeMirrorEditorAdapter implements EditorAdapter {
  private diffDecorationsCompartment = new Compartment();
  private isApplyingExternalContent = false;
  private liveMarkdownCompartment = new Compartment();
  private nodeId: string | null = null;
  private onChange?: (content: string) => void;
  private view: EditorView;
  private hideTitleHeading = false;

  constructor(host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
    this.hideTitleHeading = options.hideTitleHeading === true;
    this.onChange = options.onChange;
    this.view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: options.initialContent,
        extensions: [
          markdown(),
          anchorStructureGuard,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorState.readOnly.of(options.readOnly === true),
          // Keep the DOM selectable even in read-only panes so users can copy text from comparison views.
          EditorView.editable.of(true),
          drawSelection(),
          EditorView.lineWrapping,
          highlightActiveLine(),
          markdownInputAssist,
          this.diffDecorationsCompartment.of(EditorView.decorations.of(Decoration.none)),
          this.liveMarkdownCompartment.of(createLiveMarkdown(this.hideTitleHeading, this.nodeId)),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || !this.onChange || this.isApplyingExternalContent) {
              return;
            }
            this.onChange(update.state.doc.toString());
          })
        ]
      })
    });
  }

  destroy() {
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
      effects: this.liveMarkdownCompartment.reconfigure(createLiveMarkdown(this.hideTitleHeading, this.nodeId))
    });
  }

  setNodeId(nodeId: string | null) {
    this.nodeId = nodeId;
    this.view.dispatch({
      effects: this.liveMarkdownCompartment.reconfigure(createLiveMarkdown(this.hideTitleHeading, this.nodeId))
    });
  }

  getSelection(): EditorSelection {
    const { from, to } = this.view.state.selection.main;
    return { from, to };
  }

  setSelection(selection: EditorSelection) {
    const { anchor, head } = this.clampSelection(selection);
    this.view.dispatch({
      selection: { anchor, head },
      scrollIntoView: false
    });
  }

  revealSelection(selection: EditorSelection) {
    const { anchor, head } = this.clampSelection(selection);
    this.view.dispatch({
      selection: { anchor, head },
      scrollIntoView: true
    });
    this.view.focus();
    this.alignSelectionInViewport(anchor);
  }

  private clampSelection(selection: EditorSelection) {
    const anchor = this.clampPosition(selection.from);
    const head = this.clampPosition(selection.to);
    return { anchor, head };
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
    this.view.dispatch({
      annotations: bypassAnchorStructureGuard.of(true),
      changes: { from, to, insert: content },
      selection: { anchor: from + content.length }
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
        effects: this.diffDecorationsCompartment.reconfigure(EditorView.decorations.of(Decoration.none))
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
