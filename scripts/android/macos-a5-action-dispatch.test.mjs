import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { expect, it, vi } from 'vitest';

import { dispatchMacosA5Action } from './macos-a5-action-dispatch.mjs';
import { inspectExistingSyncDevice } from './macos-a5-existing-sync-readiness-runner.mjs';

vi.mock('./macos-a5-existing-sync-readiness-runner.mjs', () => ({ inspectExistingSyncDevice: vi.fn() }));

it('binds read-only preflight to the daily library and refuses unreviewed differences', async () => {
  vi.mocked(inspectExistingSyncDevice).mockResolvedValue({ resultStatus: 'approval_required' });
  const assertFixed = vi.fn();
  const build = vi.fn();
  await expect(dispatchMacosA5Action({ action: 'existing-sync-preflight', assertFixed, build,
    paths: { adb: '/adb', desktopDevLibrary: '/different-controller-library' } }))
    .rejects.toThrow('content differences require review');
  expect(inspectExistingSyncDevice).toHaveBeenCalledWith({ adb: '/adb',
    desktopDatabase: '/Users/roamer/Documents/Foliole/Data/foliole.db' });
  expect(assertFixed).toHaveBeenCalledOnce();
  expect(build).not.toHaveBeenCalled();
});

it.each(['single-principal-sync-group', 'image-content-sync'])(
  'runs %s from the APK source root with its device output reader', action => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-frozen-dispatch-'));
  const actionDirectory = path.join(root, 'scripts/android');
  const marker = path.join(root, 'controller-source.json');
  fs.mkdirSync(actionDirectory, { recursive: true });
  fs.writeFileSync(path.join(actionDirectory, 'macos-a5-single-principal-sync-group-entry.mjs'),
    `import fs from 'node:fs';
export async function runMacosA5SinglePrincipalSyncGroupEntry(args) {
  if (args.scenario === 'image-content' && args.captured('/adb', ['pidof']) !== '1234') {
    throw new Error('Device output reader was not forwarded.');
  }
  fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify(args.paths));
}
`);
  try {
    const paths = { acceptedRevision: 'frozen-tip', buildRoot: root };
    const entry = pathToFileURL(path.resolve('scripts/android/macos-a5-action-dispatch.mjs')).href;
    execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { dispatchMacosA5Action } from ${JSON.stringify(entry)};
await dispatchMacosA5Action({ action: ${JSON.stringify(action)}, captured: () => '1234',
  paths: ${JSON.stringify(paths)},
  assertFixed: () => { throw new Error('Unfrozen controller was executed.'); }
});`]);
    expect(JSON.parse(fs.readFileSync(marker, 'utf8'))).toEqual(paths);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
