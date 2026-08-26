import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

it('activates the T152 join surfaces through production desktop and companion entry points', () => {
  const sources = (files: string[]) => files.map((file) =>
    readFileSync(path.resolve(process.cwd(), file), 'utf8')).join('\n');
  expect(sources([
    'src/app/components/AppOverlayStack.tsx',
    'src/app/components/SyncGroupJoinRequestsDialog.tsx'
  ])).toContain('SyncGroupJoinRequestsDialog');
  expect(sources([
    'src/companion/CompanionSyncContent.tsx',
    'src/companion/CompanionSyncPanel.tsx'
  ])).toContain('CompanionSyncPanel');
  expect(sources(['electron/preload.cjs'])).toContain('onSyncGroupJoinRequestsChanged');
});
