import {
  remapTextAnchorLocator
} from '../features/editor/model/textAnchorLocatorResolution';
import { deriveNodeTitleForCloze, deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import {
  getTextAnchorLocators,
  isTextAnchorLocator,
  isTextAnchorLocatorGroup,
  type Node,
  type TextAnchorLocator
} from '../features/nodes/model/nodeTypes';

const CLOZE_PLACEHOLDER = '[...]';

function createClozePromptContent(parentContent: string, from: number, to: number) {
  const promptContent = `${parentContent.slice(0, from)}${CLOZE_PLACEHOLDER}${parentContent.slice(to)}`.trim();
  return promptContent || CLOZE_PLACEHOLDER;
}

function createPromptContentForLocators(parentContent: string, locators: TextAnchorLocator[]) {
  const promptContent = [...locators]
    .sort((left, right) => right.from - left.from)
    .reduce(
      (currentContent, locator) =>
        `${currentContent.slice(0, locator.from)}${CLOZE_PLACEHOLDER}${currentContent.slice(locator.to)}`,
      parentContent
    )
    .trim();
  return promptContent || CLOZE_PLACEHOLDER;
}

function createLocatorValue(locators: TextAnchorLocator[]) {
  return locators.length === 1 ? locators[0] : { ranges: locators };
}

function areLocatorsEqual(left: TextAnchorLocator[], right: TextAnchorLocator[]) {
  return left.length === right.length && left.every((locator, index) => {
    const other = right[index];
    return Boolean(
      other &&
        locator.from === other.from &&
        locator.to === other.to &&
        locator.originalText === other.originalText
    );
  });
}

function shouldKeepUnresolvedTextAnchorNode(locators: TextAnchorLocator[], selectedTexts: string[]) {
  return selectedTexts.every((selectedText) => selectedText.length === 0)
    && locators.some((locator) => locator.originalText.trim().length > 0);
}

function buildUnresolvedTextAnchorNode(args: {
  nextLocators: TextAnchorLocator[];
  node: Node;
  timestamp: string;
}) {
  if (!args.node.anchorLink) {
    return null;
  }
  const currentLocators = getTextAnchorLocators(args.node.anchorLink.locator);
  if (areLocatorsEqual(currentLocators, args.nextLocators)) {
    return null;
  }
  return {
    ...args.node,
    anchorLink: {
      ...args.node.anchorLink,
      locator: createLocatorValue(args.nextLocators)
    },
    updatedAt: args.timestamp
  } satisfies Node;
}

function shouldSyncTextAnchorNode(node: Node, parentNodeId: string) {
  return node.parentNodeId === parentNodeId && getTextAnchorLocators(node.anchorLink?.locator).length > 0;
}

function buildNextTextAnchorNode(args: {
  nextContent: string;
  node: Node;
  previousContent?: string;
  timestamp: string;
}) {
  if (!args.node.anchorLink) {
    return null;
  }
  const currentLocators = getTextAnchorLocators(args.node.anchorLink.locator);
  if (currentLocators.length === 0) {
    return null;
  }
  const nextLocators = currentLocators.map((locator) => remapTextAnchorLocator(args.nextContent, locator, args.previousContent));
  const nextSelectedTexts = nextLocators.map((locator) => args.nextContent.slice(locator.from, locator.to));
  if (shouldKeepUnresolvedTextAnchorNode(nextLocators, nextSelectedTexts)) {
    return buildUnresolvedTextAnchorNode({
      nextLocators,
      node: args.node,
      timestamp: args.timestamp
    });
  }
  if (nextSelectedTexts.some((selectedText) => selectedText.length === 0)) {
    return null;
  }
  const nextSelectedText = nextSelectedTexts.join('\n');
  const nextContent =
    args.node.anchorLink.kind === 'cloze'
      ? createPromptContentForLocators(args.nextContent, nextLocators)
      : nextSelectedText;
  const nextReveal = args.node.anchorLink.kind === 'cloze' ? nextSelectedText : args.node.reveal;
  const currentLocatorValue = args.node.anchorLink.locator;
  const currentSingleLocator = isTextAnchorLocator(currentLocatorValue) ? currentLocatorValue : null;
  const currentGroupLocator = isTextAnchorLocatorGroup(currentLocatorValue) ? currentLocatorValue : null;
  if (
    (
      (currentSingleLocator !== null && nextLocators.length === 1 && areLocatorsEqual([currentSingleLocator], nextLocators)) ||
      (currentGroupLocator !== null && areLocatorsEqual(currentGroupLocator.ranges, nextLocators))
    ) &&
    (args.node.anchorLink.kind !== 'highlight' || args.node.content === nextSelectedText) &&
    (args.node.anchorLink.kind !== 'cloze' || (args.node.reveal === nextSelectedText && args.node.content === nextContent))
  ) {
    return null;
  }

  const nextTitle = args.node.isTitleManual
    ? args.node.title
    : args.node.anchorLink.kind === 'cloze'
      ? deriveNodeTitleForCloze(nextContent, nextSelectedText)
      : deriveNodeTitleFromContent(nextSelectedText);
  return {
    ...args.node,
    content: nextContent,
    anchorLink: {
      ...args.node.anchorLink,
      locator: createLocatorValue(nextLocators)
    },
    hasContent: nextContent.trim().length > 0,
    hasReveal: nextReveal !== null,
    reveal: nextReveal,
    title: nextTitle,
    updatedAt: args.timestamp
  } satisfies Node;
}

export function syncTextAnchorLocatorsForParentContent(args: {
  nextContent: string;
  nodesById: Record<string, Node>;
  parentNodeId: string;
  previousContent?: string;
  timestamp: string;
}) {
  const updatedNodes: Node[] = [];
  let nextNodesById = args.nodesById;

  Object.values(args.nodesById).forEach((node) => {
    if (!shouldSyncTextAnchorNode(node, args.parentNodeId)) {
      return;
    }
    const nextNode = buildNextTextAnchorNode({
      nextContent: args.nextContent,
      node,
      previousContent: args.previousContent,
      timestamp: args.timestamp
    });
    if (!nextNode) {
      return;
    }
    if (nextNodesById === args.nodesById) {
      nextNodesById = { ...args.nodesById };
    }
    nextNodesById[nextNode.id] = nextNode;
    updatedNodes.push(nextNode);
  });

  return {
    nextNodesById,
    updatedNodes
  };
}
