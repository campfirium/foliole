import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import { anchorStructureGuard, bypassAnchorStructureGuard } from './anchorStructureGuard';
import type { EditorAdapter, EditorSelection } from './EditorAdapter';
import { liveMarkdown } from './liveMarkdown';

interface CodeMirrorEditorAdapterOptions {
  initialContent: string;
  onChange?: (content: string) => void;
}

export class CodeMirrorEditorAdapter implements EditorAdapter {
  private isApplyingExternalContent = false;
  private onChange?: (content: string) => void;
  private view: EditorView;

  constructor(host: HTMLElement, options: CodeMirrorEditorAdapterOptions) {
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
          EditorView.lineWrapping,
          highlightActiveLine(),
          liveMarkdown,
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

  getSelection(): EditorSelection {
    const { from, to } = this.view.state.selection.main;
    return { from, to };
  }

  setSelection(selection: EditorSelection) {
    const max = this.view.state.doc.length;
    const anchor = Math.max(0, Math.min(selection.from, max));
    const head = Math.max(0, Math.min(selection.to, max));

    this.view.dispatch({
      selection: { anchor, head },
      scrollIntoView: false
    });
  }

  getScrollTop() {
    return this.view.scrollDOM.scrollTop;
  }

  setScrollTop(scrollTop: number) {
    if (!Number.isFinite(scrollTop)) {
      return;
    }
    this.view.scrollDOM.scrollTop = Math.max(0, scrollTop);
  }

  replaceSelection(content: string) {
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from, to, insert: content },
      selection: { anchor: from + content.length }
    });
  }

  onContentChange(listener: (content: string) => void) {
    this.onChange = listener;
    return () => {
      this.onChange = undefined;
    };
  }
}
