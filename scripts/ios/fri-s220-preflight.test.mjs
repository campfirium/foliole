import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { inspectFriS220Preflight } from './fri-s220-preflight.mjs';

const groupId = 'group-563c698c-b964-4c05-b273-c3d9c2c02995';

function state(overrides = {}) {
  return { conflicts: 0, groupIds: [groupId], nodesById: {
    a: { content: 'A body', id: 'a', currentVersionId: 'v1',
      title: 'Multi-device sync A fact' },
    d: { id: 'd', title: 'Multi-device sync D fact' }
  }, ...overrides };
}

it('writes a residue-free fixed-attempt preflight receipt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-s220-'));
  const receiptPath = path.join(root, 'receipt.json');
  await expect(inspectFriS220Preflight({ groupId, readState: async () => state(),
    receiptPath })).resolves.toMatchObject({ resultStatus: 'ready', sourceVersionId: 'v1' });
  expect(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).attempt.attemptId)
    .toBe('c3d9c2c02995');
});

it('stops before the manual window when group identity or residue is unsafe', async () => {
  await expect(inspectFriS220Preflight({ groupId,
    readState: async () => state({ groupIds: [] }) })).rejects.toThrow('exactly once');
  await expect(inspectFriS220Preflight({ groupId,
    readState: async () => state({ conflicts: 1 }) })).rejects.toThrow('already has a conflict');
});
