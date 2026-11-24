import { getStoredAppLocale } from '../localization/appLanguage';
import { translate } from '../localization/translations';

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

interface WebLookupTitleNode { id: string; kind: string; parentNodeId: string | null; title: string }

function normalizeTitle(title: string) {
  return title.trim() || translate(getStoredAppLocale(), 'desktop.search.context.untitled');
}

function collectNodePath(activeNodeId: string, nodesById: Record<string, WebLookupTitleNode | undefined>) {
  const path: WebLookupTitleNode[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = activeNodeId;
  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const node: WebLookupTitleNode | undefined = nodesById[cursorId];
    if (!node) break;
    path.push(node);
    cursorId = node.parentNodeId;
  }
  return path.reverse();
}

function isSourceTopic(node: WebLookupTitleNode, nodesById: Record<string, WebLookupTitleNode | undefined>) {
  if (node.kind !== 'topic') {
    return false;
  }
  const parentNode = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  return !parentNode || parentNode.kind === 'folder';
}

export function resolveWebLookupTitle(
  activeNodeId: string,
  nodesById: Record<string, WebLookupTitleNode | undefined>
) {
  const path = collectNodePath(activeNodeId, nodesById);
  const sourceTopic = path.find((node) => isSourceTopic(node, nodesById));
  return normalizeTitle(sourceTopic?.title ?? nodesById[activeNodeId]?.title ?? '');
}
