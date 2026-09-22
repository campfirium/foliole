import type { EditorView } from '@codemirror/view';

import { decideClipboardPasteSource } from '../../../../lib/clipboard/clipboardPasteSource';
import { convertHtmlToMarkdownCompatible } from '../../../../lib/core/import/htmlToMarkdownCompatible';
import {
  extractMarkedTextAnchorRanges,
  parseStructuredClipboardPayload
} from '../model/anchorClipboardPayload';

import { FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';

export { handleClipboardImagePaste } from './clipboardImagePaste';

interface ClipboardLike {
  getData: (format: string) => string;
}

function dispatchInsertedText(view: EditorView, content: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: content, to },
    selection: { anchor: from + content.length },
    userEvent: 'input.paste'
  });
  return from;
}

function resolveClipboardTextAnchors(content: string) {
  return extractMarkedTextAnchorRanges(content);
}

export function handleInternalClipboardPaste(clipboard: ClipboardLike | null, view: EditorView) {
  if (!clipboard) {
    return false;
  }

  const rawPayload = clipboard.getData(FOLIOLE_CLIPBOARD_MIME);
  if (!rawPayload) {
    return false;
  }

  const parsed = parseStructuredClipboardPayload(rawPayload);
  if (parsed) {
    dispatchInsertedText(view, parsed.internalText);
    return true;
  }

  dispatchInsertedText(view, rawPayload);
  return true;
}

export function handleMarkdownCompatibleHtmlPaste(clipboard: ClipboardLike | null, view: EditorView) {
  if (!clipboard) {
    return false;
  }

  const plainText = clipboard.getData('text/plain');
  const markedText = resolveClipboardTextAnchors(plainText);
  if (markedText) {
    dispatchInsertedText(view, markedText.text);
    return true;
  }

  const html = clipboard.getData('text/html');
  const source = decideClipboardPasteSource({ html, plainText });
  if (!source || (source.kind !== 'plain-markdown' && source.kind !== 'rich-html')) {
    return false;
  }
  if (source.kind === 'plain-markdown') {
    dispatchInsertedText(view, source.content);
    return true;
  }

  const converted = convertHtmlToMarkdownCompatible(source.content).content;
  if (!converted) {
    return false;
  }

  const convertedMarkedText = resolveClipboardTextAnchors(converted);
  if (convertedMarkedText) {
    dispatchInsertedText(view, convertedMarkedText.text);
    return true;
  }

  dispatchInsertedText(view, converted);
  return true;
}
