import { upsertNodeSnapshot } from '../database/nodeMutations.js';

function createBaseNode(args: {
  content: string;
  nodeId: string;
  parentNodeId: string | null;
  position: number;
  title: string;
}) {
  return {
    anchorLink: null,
    content: args.content,
    createdAt: '2026-04-14T00:00:00.000Z',
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic' as const,
    nodeId: args.nodeId,
    parentNodeId: args.parentNodeId,
    position: args.position,
    reveal: null,
    title: args.title,
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

function createHighlightNode(args: {
  anchorId?: string;
  from: number;
  nodeId: string;
  originalText: string;
  parentNodeId: string;
  position: number;
  title: string;
  to: number;
}) {
  return {
    ...createBaseNode({
      content: args.title,
      nodeId: args.nodeId,
      parentNodeId: args.parentNodeId,
      position: args.position,
      title: args.title
    }),
    anchorLink: {
      id: args.anchorId ?? args.nodeId.replace('node-', 'hl-'),
      kind: 'highlight' as const,
      locator: {
        from: args.from,
        originalText: args.originalText,
        to: args.to
      }
    }
  };
}

export function seedArticleWithLocatorHighlight() {
  upsertNodeSnapshot(createBaseNode({
    content: 'Keep bright text here.',
    nodeId: 'node-article',
    parentNodeId: null,
    position: 0,
    title: 'Mirror Export Demo'
  }));
  upsertNodeSnapshot(createHighlightNode({
    anchorId: 'hl-1',
    from: 5,
    nodeId: 'node-highlight',
    originalText: 'bright text',
    parentNodeId: 'node-article',
    position: 1,
    title: 'bright text',
    to: 16
  }));
}

export function seedArticleWithOverlappingLocatorHighlights() {
  upsertNodeSnapshot(createBaseNode({
    content: 'ABCDE',
    nodeId: 'node-article-overlap',
    parentNodeId: null,
    position: 0,
    title: 'Mirror Export Overlap Demo'
  }));
  upsertNodeSnapshot(createHighlightNode({
    anchorId: 'hl-1',
    from: 0,
    nodeId: 'node-highlight-overlap-1',
    originalText: 'ABC',
    parentNodeId: 'node-article-overlap',
    position: 1,
    title: 'ABC',
    to: 3
  }));
  upsertNodeSnapshot(createHighlightNode({
    anchorId: 'hl-2',
    from: 2,
    nodeId: 'node-highlight-overlap-2',
    originalText: 'CDE',
    parentNodeId: 'node-article-overlap',
    position: 2,
    title: 'CDE',
    to: 5
  }));
}

export function seedArticleWithAdjacentLocatorHighlights() {
  upsertNodeSnapshot(createBaseNode({
    content: 'ABCDE',
    nodeId: 'node-article-adjacent',
    parentNodeId: null,
    position: 0,
    title: 'Mirror Export Adjacent Demo'
  }));
  upsertNodeSnapshot(createHighlightNode({
    anchorId: 'hl-1',
    from: 0,
    nodeId: 'node-highlight-adjacent-1',
    originalText: 'AB',
    parentNodeId: 'node-article-adjacent',
    position: 1,
    title: 'AB',
    to: 2
  }));
  upsertNodeSnapshot(createHighlightNode({
    anchorId: 'hl-2',
    from: 2,
    nodeId: 'node-highlight-adjacent-2',
    originalText: 'CD',
    parentNodeId: 'node-article-adjacent',
    position: 2,
    title: 'CD',
    to: 4
  }));
}

export function seedArticleWithUnresolvedLocatorHighlight() {
  upsertNodeSnapshot(createBaseNode({
    content: 'Keep  here.',
    nodeId: 'node-article-unresolved',
    parentNodeId: null,
    position: 0,
    title: 'Mirror Export Unresolved Demo'
  }));
  upsertNodeSnapshot(createHighlightNode({
    anchorId: 'hl-1',
    from: 5,
    nodeId: 'node-unresolved-highlight',
    originalText: 'bright text',
    parentNodeId: 'node-article-unresolved',
    position: 1,
    title: 'bright text',
    to: 5
  }));
}
