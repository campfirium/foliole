import type { EditorView } from '@codemirror/view';

import { decideClipboardPasteSource } from '../../../../lib/clipboard/clipboardPasteSource';
import { convertHtmlToMarkdownCompatible } from '../../../../lib/core/import/htmlToMarkdownCompatible';
import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { importClipboardImageAttachment } from '../../../shared/platform/attachmentImports';
import {
  extractMarkedTextAnchorRanges,
  parseStructuredClipboardPayload
} from '../model/anchorClipboardPayload';

import { FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';

interface ClipboardLike {
  getData: (format: string) => string;
  items?: Iterable<ClipboardItemLike> | ArrayLike<ClipboardItemLike>;
}

interface ClipboardItemLike {
  kind: string;
  type: string;
  getAsFile?: () => File | null;
}

function dispatchInsertedText(view: EditorView, content: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: content, to },
    selection: { anchor: from + content.length }
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

function collectClipboardImageFiles(clipboard: ClipboardLike | null) {
  const items = clipboard?.items ? Array.from(clipboard.items) : [];
  if (items.length === 0) {
    return [];
  }

  return items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile?.())
    .filter((file): file is File => file instanceof File);
}

function createImagePastePlaceholder() {
  return `<!-- foliole-image-paste:${crypto.randomUUID()} -->`;
}

function replaceDocumentRange(view: EditorView, from: number, to: number, content: string) {
  view.dispatch({
    changes: { from, to, insert: content },
    selection: { anchor: from + content.length }
  });
}

function replacePlaceholder(view: EditorView, placeholder: string, content: string) {
  const currentContent = view.state.doc.toString();
  const markerIndex = currentContent.indexOf(placeholder);
  if (markerIndex < 0) {
    return false;
  }
  replaceDocumentRange(view, markerIndex, markerIndex + placeholder.length, content);
  return true;
}

function createMarkdownImageLine(attachmentId: string, originalName: string) {
  const baseName = originalName.replace(/\.[^.]+$/, '').trim();
  const altText = baseName.length > 0 ? baseName : 'Pasted image';
  return `![${altText}](${buildAssetMarkdownUrl(attachmentId, originalName)})`;
}

export function handleClipboardImagePaste(clipboard: ClipboardLike | null, view: EditorView, nodeId: string | null) {
  if (!nodeId) {
    return false;
  }

  const imageFiles = collectClipboardImageFiles(clipboard);
  if (imageFiles.length === 0) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  const placeholder = createImagePastePlaceholder();
  replaceDocumentRange(view, from, to, placeholder);

  void (async () => {
    const importedLines: string[] = [];

    for (const imageFile of imageFiles) {
      const result = await importClipboardImageAttachment(nodeId, imageFile);
      if (result?.status === 'imported') {
        importedLines.push(createMarkdownImageLine(result.attachment_id, result.original_name));
      }
    }

    replacePlaceholder(view, placeholder, importedLines.join('\n'));
  })();

  return true;
}
