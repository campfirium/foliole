import { extractUniqueArticleTitleHeading } from './articleTitleHeading';
import { deriveNodeTitleFromContent } from './deriveNodeTitle';
import type { Node } from './nodeTypes';

export type NodeDerivedTitleSource = Pick<Node, 'isTitleManual' | 'kind' | 'title'>;

// Desktop and mobile body edits share one title rule: a unique article heading wins for topics,
// then a manual title is kept, otherwise the title follows the body.
export function resolveNodeDerivedTitle(node: NodeDerivedTitleSource, content: string) {
  if (node.kind === 'topic') {
    const articleTitle = extractUniqueArticleTitleHeading(content)?.title;
    if (articleTitle) return articleTitle;
  }
  return node.isTitleManual ? node.title : deriveNodeTitleFromContent(content);
}
