import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { runWindowsSyncGroupBaselineReset } from './windows-sync-group-baseline-action.mjs';

it('protects old C, boots a fresh product workspace, then protects the empty baseline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-windows-baseline-'));
  const clientRoot = path.join(root, '.tmp', 'artifacts', 'windows-sync-group-client-c');
  const library = path.join(clientRoot, 'library');
  fs.mkdirSync(path.join(library, 'Data'), { recursive: true });
  fs.mkdirSync(path.join(clientRoot, 'user-data'), { recursive: true });
  fs.writeFileSync(path.join(library, 'Data', 'foliole.db'), 'old');
  const paths = { repoRoot: root };
  const facts = (empty) => ({ activeMemberCount: empty ? 0 : 2, attachmentCount: empty ? 0 : 3,
    contentBlobCount: empty ? 0 : 4, deviceIdentity: empty ? 'device-c-new' : 'device-c-old',
    integrity: 'ok', localGroupId: empty ? null : 'group-old',
    localMemberState: empty ? null : 'active', localTimelineId: empty ? null : 'timeline-old',
    nodeCount: empty ? 1 : 5 });
  const controls = [];
  const inspectDatabase = async (_execute, _paths, databasePath = path.join(library, 'Data', 'foliole.db')) =>
    facts(fs.readFileSync(databasePath, 'utf8') === 'fresh');
  const result = await runWindowsSyncGroupBaselineReset({ buildIdentity: 'candidate-1',
    controlNativeClient: async (_execute, _paths, action) => controls.push(action),
    evidenceRoot: path.join(root, 'evidence'), execute: async () => ({ code: 0 }),
    inspectDatabase, openSession: async () => {
      fs.mkdirSync(path.join(library, 'Data'), { recursive: true });
      fs.writeFileSync(path.join(library, 'Data', 'foliole.db'), 'fresh');
      return { app: { close: async () => undefined } };
    }, paths });
  const manifest = JSON.parse(fs.readFileSync(result.syncGroupBaseline.manifestPath, 'utf8'));
  expect(controls).toEqual(['stop', 'start']);
  expect(manifest).toMatchObject({ baselineProtection: { deviceIdentity: 'device-c-new' },
    emptyFacts: { activeMemberCount: 0, localGroupId: null, nodeCount: 1 },
    originalProtection: { deviceIdentity: 'device-c-old' }, resultStatus: 'success' });
});
