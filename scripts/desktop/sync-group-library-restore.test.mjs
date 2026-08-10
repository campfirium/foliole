import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { restoreOwnedLibrary } from './sync-group-library-restore.mjs';

it('stages and byte-verifies a protected root before quarantining the current root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-restore-'));
  const backup = path.join(root, 'backup');
  const target = path.join(root, 'target');
  const quarantine = path.join(root, 'quarantine');
  for (const [folder, value] of [[backup, 'old'], [target, 'empty']]) {
    fs.mkdirSync(path.join(folder, 'library', 'Data'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'library', 'Data', 'foliole.db'), value);
  }
  const inspectDatabase = async (file) => ({ activeMemberCount: 2, attachmentCount: 3,
    contentBlobCount: 4, deviceIdentity: 'device-c', integrity: 'ok', localGroupId: 'group-old',
    localMemberState: 'active', localTimelineId: 'timeline-old', nodeCount: 5,
    value: fs.readFileSync(file, 'utf8') });
  const result = await restoreOwnedLibrary({ backupRoot: backup,
    databaseRelativePath: path.join('library', 'Data', 'foliole.db'), inspectDatabase,
    quarantineRoot: quarantine, targetRoot: target });
  expect(fs.readFileSync(path.join(target, 'library', 'Data', 'foliole.db'), 'utf8')).toBe('old');
  expect(fs.readFileSync(path.join(quarantine, 'library', 'Data', 'foliole.db'), 'utf8')).toBe('empty');
  expect(result).toMatchObject({ backupFacts: { deviceIdentity: 'device-c' },
    restoredFacts: { localGroupId: 'group-old' } });
});
