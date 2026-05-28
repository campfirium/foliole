import { describe, expect, it } from 'vitest';

import {
  getHelpKnowledgeItem,
  HELP_KNOWLEDGE_ITEMS,
  queryHelpKnowledge
} from './helpKnowledge';

describe('help knowledge', () => {
  it('searches action help titles, bodies, keywords, and source labels', () => {
    expect(queryHelpKnowledge('relearn').map((item) => item.id)).toContain('actionHelp.nodeList.relearn');
    expect(queryHelpKnowledge('topic list').map((item) => item.id)).toContain('actionHelp.nodeList.relearn');
    expect(queryHelpKnowledge('study').map((item) => item.id)).toContain('actionHelp.nodeList.relearn');
    expect(queryHelpKnowledge('obvious').map((item) => item.id)).toContain('actionHelp.review.easy');
    expect(queryHelpKnowledge('clipboard').map((item) => item.id)).toContain('actionHelp.nodeList.pasteClipboardTopic');
  });

  it('returns the action help entries while the query is empty', () => {
    expect(queryHelpKnowledge('')).toHaveLength(HELP_KNOWLEDGE_ITEMS.length);
  });

  it('uses the action help id and copy for Relearn', () => {
    expect(getHelpKnowledgeItem('actionHelp.nodeList.relearn')).toMatchObject({
      body: "Clear this topic's learning progress.",
      sourceLabel: 'Topic list menu',
      title: 'Relearn'
    });
  });
});
