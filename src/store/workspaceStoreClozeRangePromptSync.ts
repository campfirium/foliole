import { deriveNodeTitleForCloze } from '../features/nodes/model/deriveNodeTitle';
import type { Node, TextAnchorLocator } from '../features/nodes/model/nodeTypes';

import type { TextAnchorRangeUpdate } from './workspaceStoreTextAnchorRangeSync';

const CLOZE_PLACEHOLDER = '[...]';

function buildClozePrompt(parentContent: string, range: TextAnchorRangeUpdate) {
  return `${parentContent.slice(0, range.from)}${CLOZE_PLACEHOLDER}${parentContent.slice(range.to)}`.trim();
}

function splitSinglePlaceholder(content: string) {
  const first = content.indexOf(CLOZE_PLACEHOLDER);
  if (first < 0 || content.indexOf(CLOZE_PLACEHOLDER, first + CLOZE_PLACEHOLDER.length) >= 0) {
    return null;
  }
  return {
    prefix: content.slice(0, first),
    suffix: content.slice(first + CLOZE_PLACEHOLDER.length)
  };
}

function isGeneratedClozePrompt(args: {
  content: string;
  parentContent: string;
  previousLocator: TextAnchorLocator;
}) {
  if (args.content === buildClozePrompt(args.parentContent, args.previousLocator)) {
    return true;
  }
  const split = splitSinglePlaceholder(args.content);
  if (!split || !args.parentContent.startsWith(split.prefix) || !args.parentContent.endsWith(split.suffix)) {
    return false;
  }
  const middleEnd = args.parentContent.length - split.suffix.length;
  return args.parentContent.slice(split.prefix.length, middleEnd).trim() === args.previousLocator.originalText;
}

export function buildUpdatedClozeFields(args: {
  locator: TextAnchorLocator;
  node: Node;
  parentContent: string;
  previousLocator: TextAnchorLocator;
}) {
  const nextPrompt = buildClozePrompt(args.parentContent, args.locator);
  const previousPrompt = buildClozePrompt(args.parentContent, args.previousLocator);
  const previousTitle = deriveNodeTitleForCloze(previousPrompt, args.previousLocator.originalText);
  const currentTitle = deriveNodeTitleForCloze(args.node.content, args.previousLocator.originalText);
  const shouldSyncContent = isGeneratedClozePrompt({
    content: args.node.content,
    parentContent: args.parentContent,
    previousLocator: args.previousLocator
  });
  return {
    ...(shouldSyncContent ? { content: nextPrompt } : {}),
    ...(args.node.reveal === args.previousLocator.originalText ? { reveal: args.locator.originalText } : {}),
    ...(!args.node.isTitleManual && (args.node.title === previousTitle || args.node.title === currentTitle)
      ? { title: deriveNodeTitleForCloze(nextPrompt, args.locator.originalText) }
      : {})
  };
}
