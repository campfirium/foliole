import type { EditorView } from '@codemirror/view';

import { buildAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';
import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import { importClipboardImageAttachment } from '../../../shared/platform/attachmentImports';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

import { trackClipboardImagePaste } from './clipboardImagePasteTarget';

interface ClipboardImageItem {
  kind: string;
  type: string;
  getAsFile?: () => File | null;
}

export interface ImageClipboard {
  getData: (format: string) => string;
  items?: Iterable<ClipboardImageItem> | ArrayLike<ClipboardImageItem>;
}

function collectImageFiles(clipboard: ImageClipboard | null) {
  return Array.from(clipboard?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile?.())
    .filter((file): file is File => file instanceof File);
}

async function importImages(files: File[], nodeId: string) {
  const lines: string[] = [];
  for (const file of files) {
    const result = await importClipboardImageAttachment(nodeId, file);
    if (result?.status !== 'imported') return null;
    const alt = result.original_name.replace(/\.[^.]+$/, '').trim() || 'Pasted image';
    lines.push(`![${alt}](${buildAssetMarkdownUrl(result.storage_key)})`);
  }
  return lines.join('\n');
}

export function handleClipboardImagePaste(clipboard: ImageClipboard | null, view: EditorView, nodeId: string | null) {
  if (!nodeId || view.state.readOnly) return false;
  const files = collectImageFiles(clipboard);
  if (files.length === 0) return false;
  const target = trackClipboardImagePaste(view);
  void (async () => {
    try {
      const markdown = await importImages(files, nodeId);
      if (markdown === null) {
        showAppRuntimeNotice(translate(getStoredAppLocale(), 'desktop.editor.imagePasteFailed'));
      } else if (!target.apply(markdown)) {
        showAppRuntimeNotice(translate(getStoredAppLocale(), 'desktop.editor.imagePasteCanceled'), 'info');
      }
    } catch {
      showAppRuntimeNotice(translate(getStoredAppLocale(), 'desktop.editor.imagePasteFailed'));
    } finally {
      target.release();
    }
  })();
  return true;
}
