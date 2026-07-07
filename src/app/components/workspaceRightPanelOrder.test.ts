import { expect, it } from 'vitest';

import {
  moveWorkspaceRightPanel,
  normalizeWorkspaceRightPanelOrder
} from './workspaceRightPanelOrder';

it('normalizes persisted right panel order and fills missing panels', () => {
  expect(normalizeWorkspaceRightPanelOrder('highlights,review-queue')).toEqual([
    'highlights',
    'review-queue',
    'outline',
    'backlinks',
    'assistant',
    'dev'
  ]);
});

it('moves a right panel before the drop target', () => {
  expect(
    moveWorkspaceRightPanel(
      ['review-queue', 'outline', 'highlights', 'backlinks', 'assistant', 'dev'],
      'dev',
      'outline'
    )
  ).toEqual(['review-queue', 'dev', 'outline', 'highlights', 'backlinks', 'assistant']);
});
