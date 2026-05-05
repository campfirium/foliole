import type { EditorView } from '@codemirror/view';

import { convertHtmlToMarkdownCompatible } from '../../../../lib/core/import/htmlToMarkdownCompatible';

interface ClipboardLike {
  getData: (format: string) => string;
}

export function handleMarkdownCompatibleHtmlPaste(clipboard: ClipboardLike | null, view: EditorView) {
  if (!clipboard) {
    return false;
  }

  const html = clipboard.getData('text/html');
  if (!html) {
    return false;
  }

  const converted = convertHtmlToMarkdownCompatible(html).content;
  if (!converted) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: converted, to },
    selection: { anchor: from + converted.length }
  });
  return true;
}
