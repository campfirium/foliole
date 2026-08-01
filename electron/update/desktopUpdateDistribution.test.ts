import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { readDesktopDistributionChannel } from './desktopUpdateDistribution.js';

let temporaryDirectory = '';

afterEach(async () => {
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = '';
});

it('reads only an explicit packaged distribution channel', async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-update-channel-'));
  await fs.writeFile(path.join(temporaryDirectory, 'package.json'), JSON.stringify({ folioleBuildChannel: 'github' }));
  expect(readDesktopDistributionChannel(temporaryDirectory)).toBe('github');

  await fs.writeFile(path.join(temporaryDirectory, 'package.json'), JSON.stringify({ folioleBuildChannel: 'unknown' }));
  expect(readDesktopDistributionChannel(temporaryDirectory)).toBeNull();
});
