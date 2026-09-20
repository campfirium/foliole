import { extractUniqueArticleTitleHeading } from '../features/nodes/model/articleTitleHeading';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';

export function resolveNodeDerivedTitle(node: Node, content: string) {
  if (node.kind === 'topic') {
    const articleTitle = extractUniqueArticleTitleHeading(content)?.title;
    if (articleTitle) return articleTitle;
  }
  return node.isTitleManual ? node.title : deriveNodeTitleFromContent(content);
}
