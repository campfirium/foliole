import { expect, it } from 'vitest';

import { buildCommandShortcutConflictMap } from './conflicts';

it('detects a customized last-child navigation collision', () => {
  const conflicts = buildCommandShortcutConflictMap([
    {
      commandId: 'navigation.goToLastChild',
      title: 'Go Down',
      scope: 'global',
      shortcut: { key: 'j', metaKey: true, shiftKey: true }
    },
    {
      commandId: 'workspace.openSettings',
      title: 'Open Settings',
      scope: 'global',
      shortcut: { key: 'j', metaKey: true, shiftKey: true }
    }
  ]);

  expect(conflicts['navigation.goToLastChild']?.severity).toBe('error');
});
