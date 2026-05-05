import type { EditorView } from '@codemirror/view';

import { convertHtmlToMarkdownCompatible } from '../../../../lib/core/import/htmlToMarkdownCompatible';
import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { importClipboardImageAttachment } from '../../../shared/platform/attachmentImports';

import { bypassAnchorStructureGuard } from './anchorStructureGuard';
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

export function handleInternalClipboardPaste(clipboard: ClipboardLike | null, view: EditorView) {
  if (!clipboard) {
    return false;
  }

  const internalContent = clipboard.getData(FOLIOLE_CLIPBOARD_MIME);
  if (!internalContent) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: internalContent, to },
    selection: { anchor: from + internalContent.length }
  });
  return true;
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
    annotations: bypassAnchorStructureGuard.of(true),
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
