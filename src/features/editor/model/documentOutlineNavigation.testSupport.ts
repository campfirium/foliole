import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { createExplicitArticleSnapshot, createNodeRecord } from '../../../shared/platform/companion/reading/companionReadableArticle.testSupport';
import { resolveReadableCompanionArticleByNodeId } from '../../../shared/platform/companionReadableArticle';

export const outlineBody = 'Opening passage\n\n# Chapter\n\nAlpha passage\n\n## Detail\n\nBeta passage';

export function createOutlineFixture(content = outlineBody) {
  const snapshot: WorkspaceSnapshot = createExplicitArticleSnapshot();
  snapshot.nodesById['node-1'] = createNodeRecord({ id: 'node-1', content });
  const add = (id: string, text: string, kind: 'topic' | 'item' = 'topic', parentNodeId = 'node-1') => {
    const from = content.indexOf(text);
    snapshot.nodesById[id] = createNodeRecord({ id, title: text, kind, parentNodeId,
      ...(from >= 0 ? { anchorLink: { id, kind: kind === 'topic' ? 'highlight' : 'cloze',
        locator: { from, to: from + text.length, originalText: text } } } : {}) });
    snapshot.nodeOrder.push(id);
    return snapshot.nodesById[id]!;
  };
  add('preface', 'Opening passage');
  add('alpha', 'Alpha passage');
  add('item', 'Beta passage', 'item');
  add('manual', 'Manual topic');
  const article = () => resolveReadableCompanionArticleByNodeId(snapshot, 'node-1')!;
  return { snapshot, add, article };
}
