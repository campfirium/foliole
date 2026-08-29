import { expect, it } from 'vitest';

import {
  FOUR_WAY_NAVIGATION_COMMAND_IDS,
  FOUR_WAY_NAVIGATION_COMMANDS
} from './fourWayNavigationCommands.js';

it('keeps the four navigation command identities and English titles stable', () => {
  expect(FOUR_WAY_NAVIGATION_COMMANDS.map(({ appCommandId, title }) => ({ appCommandId, title }))).toEqual([
    { appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goBack, title: 'Go Back' },
    { appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goForward, title: 'Go Forward' },
    { appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goParent, title: 'Go Up' },
    {
      appCommandId: FOUR_WAY_NAVIGATION_COMMAND_IDS.goToLastChild,
      title: 'Go Down'
    }
  ]);
});
