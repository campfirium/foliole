// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  readJson, syncGroupInteractivePaths, writeJsonAtomic, writeSyncGroupInteractiveFatal
} from './windows-sync-group-interactive-state.mjs';

it('publishes a terminal result when the interactive worker fails outside its action catch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-interactive-fatal-'));
  const paths = syncGroupInteractivePaths(root);
  fs.mkdirSync(path.dirname(paths.request), { recursive: true });
  writeJsonAtomic(paths.request, { nonce: '11111111-1111-4111-8111-111111111111' });

  writeSyncGroupInteractiveFatal(paths, new Error('electron launch failed'), 42);

  expect(readJson(paths.result)).toMatchObject({
    error: 'electron launch failed', exitCode: 1,
    nonce: '11111111-1111-4111-8111-111111111111', state: 'completed', workerPid: 42
  });
  expect(readJson(paths.status)).toEqual(readJson(paths.result));
  fs.rmSync(root, { force: true, recursive: true });
});
