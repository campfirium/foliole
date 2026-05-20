import { type WebLookupEntry, type WebLookupEntryKind } from './webLookupEntryDefaults';
import {
  isWebLookupPromptTooLong,
  resolveWebLookupOverflowTargetUrl,
  resolveWebLookupPromptActionUrl,
  resolveWebLookupPromptText,
  resolveWebLookupUrl
} from './webLookupTemplateResolution';

interface WebLookupContext {
  documentText?: string | null | undefined;
  selectionText?: string | null | undefined;
  titleText?: string | null | undefined;
}

interface ResolvedWebLookupAction {
  copyText?: string;
  kind: WebLookupEntryKind;
  label: string;
  overflowSource?: 'document' | 'selection';
  url: string;
}

export function resolveWebLookupAction(
  entry: WebLookupEntry,
  context: WebLookupContext
): ResolvedWebLookupAction | null {
  const selectionText = context.selectionText?.trim() ?? '';
  const documentText = context.documentText?.trim() ?? '';
  const sourceText = selectionText || (entry.kind === 'prompt' ? documentText : '');
  if (!sourceText) {
    return null;
  }
  if (entry.kind === 'prompt') {
    return resolvePromptAction(entry, sourceText, selectionText, context.titleText);
  }
  const url = resolveWebLookupUrl(entry, sourceText, context.titleText);
  return url ? { kind: entry.kind, label: entry.label, url } : null;
}

function resolvePromptAction(
  entry: WebLookupEntry,
  sourceText: string,
  selectionText: string,
  titleText?: string | null
): ResolvedWebLookupAction | null {
  const promptText = resolveWebLookupPromptText(entry, sourceText, titleText);
  if (!promptText) {
    return null;
  }
  if (isWebLookupPromptTooLong(promptText)) {
    const url = resolveWebLookupOverflowTargetUrl(entry);
    return url ? {
      copyText: promptText,
      kind: entry.kind,
      label: entry.label,
      overflowSource: selectionText ? 'selection' : 'document',
      url
    } : null;
  }
  const url = resolveWebLookupPromptActionUrl(entry, sourceText, titleText);
  return url ? { kind: entry.kind, label: entry.label, url } : null;
}
