import { describe, expect, it } from 'vitest';

import {
  getHelpKnowledgeItem,
  HELP_KNOWLEDGE_ITEMS,
  queryHelpKnowledge
} from './helpKnowledge';

describe('help knowledge', () => {
  it('searches menu help titles, bodies, keywords, and source labels', () => {
    expect(queryHelpKnowledge('relearn').map((item) => item.id)).toContain('menuHelp.nodeList.relearn');
    expect(queryHelpKnowledge('topic list').map((item) => item.id)).toContain('menuHelp.nodeList.relearn');
    expect(queryHelpKnowledge('study').map((item) => item.id)).toContain('menuHelp.nodeList.relearn');
  });

  it('returns the menu help entries while the query is empty', () => {
    expect(queryHelpKnowledge('')).toHaveLength(HELP_KNOWLEDGE_ITEMS.length);
  });

  it('uses the menu help id and copy for Relearn', () => {
    expect(getHelpKnowledgeItem('menuHelp.nodeList.relearn')).toMatchObject({
      body: "Reset this topic's review progress and send it back into the review queue.",
      sourceLabel: 'Menu / Topic list',
      title: 'Relearn'
    });
  });
});
