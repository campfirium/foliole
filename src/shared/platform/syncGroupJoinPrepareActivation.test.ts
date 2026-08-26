import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

it('keeps the T152 join surfaces outside production entry points during prepare', () => {
  const productionFiles = [
    'src/app/App.tsx',
    'src/companion/CompanionApp.tsx',
    'src/companion/main.tsx',
    'electron/preload.cjs'
  ];
  for (const file of productionFiles) {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    expect(source).not.toContain('SyncGroupJoinRequests');
    expect(source).not.toContain('folioleSyncGroupJoinPrepare');
  }
});
