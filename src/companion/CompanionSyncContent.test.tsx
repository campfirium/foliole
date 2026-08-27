import fs from 'node:fs';

import { expect, it } from 'vitest';

it('routes the Sync Group surface only through the cutover discovery and request actions', () => {
  const source = fs.readFileSync('src/companion/CompanionSyncContent.tsx', 'utf8');
  expect(source).toContain('onDiscover: workspaceSync.discoverSyncGroups');
  expect(source).toContain('onRequestJoin: workspaceSync.requestSyncGroupJoin');
  expect(source).not.toContain('onDiscover: workspaceSync.checkDesktop');
  expect(source).not.toContain('onRequestJoin: workspaceSync.requestJoin');
});
