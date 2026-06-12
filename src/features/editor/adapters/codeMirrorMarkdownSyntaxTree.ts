import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

export function readVisibleMarkdownSyntaxTree(view: EditorView) {
  return ensureSyntaxTree(view.state, view.viewport.to, 5) ?? syntaxTree(view.state);
}
