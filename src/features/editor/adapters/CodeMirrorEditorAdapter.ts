import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import type { EditorAdapter, EditorSelection } from './EditorAdapter';
import { liveMarkdown } from './liveMarkdown';

interface CodeMirrorEditorAdapterOptions {
  initialContent: string;
  onChange?: (content: string) => void;
}

export class CodeMirrorEditorAdapter implements EditorAdapter {
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
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          highlightActiveLine(),
          liveMarkdown,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || !this.onChange) {
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

    this.view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: content }
    });
  }

  getSelection(): EditorSelection {
    const { from, to } = this.view.state.selection.main;
    return { from, to };
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
