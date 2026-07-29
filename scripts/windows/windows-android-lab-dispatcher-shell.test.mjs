// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { dispatchWindowsAndroidLab } from './windows-android-lab-dispatcher.mjs';
import { androidLabPaths } from './windows-android-lab-state.mjs';

it('prefers explicit argv when invoked through an ordinary SSH shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-shell-'));
  try {
    const result = await dispatchWindowsAndroidLab({
      argv: ['status'], env: { SSH_ORIGINAL_COMMAND: 'node.exe dispatcher.mjs status' }, paths: androidLabPaths(root)
    });
    expect(result.state).toBe('idle');
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
