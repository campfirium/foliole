import { expect, it } from 'vitest';

import { moveWorkspaceRightPanel, normalizeWorkspaceRightPanelOrder } from './workspaceRightPanelOrder';

it('normalizes persisted right panel order and fills missing panels', () => {
  expect(normalizeWorkspaceRightPanelOrder('highlights,review-queue')).toEqual([
    'highlights',
    'review-queue',
    'source-info',
    'backlinks',
    'performance',
    'dev'
  ]);
});

it('moves a right panel before the drop target', () => {
  expect(
    moveWorkspaceRightPanel(
      ['review-queue', 'source-info', 'highlights', 'backlinks', 'performance', 'dev'],
      'dev',
      'source-info'
    )
  ).toEqual(['review-queue', 'dev', 'source-info', 'highlights', 'backlinks', 'performance']);
});
