// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { buildA5TwoDeviceAcceptance } from './a5-two-device-build.mjs';
import { assertImageContentFact } from './macos-a5-image-content-evidence.mjs';
import { removeA5AcceptanceApplication } from './macos-a5-acceptance-package-cleanup.mjs';
import { runMacosA5SinglePrincipalSyncGroupEntry } from './macos-a5-single-principal-sync-group-entry.mjs';

vi.mock('./a5-two-device-build.mjs', () => ({ buildA5TwoDeviceAcceptance: vi.fn(() => ({})) }));
vi.mock('./macos-a5-acceptance-package-cleanup.mjs', () => ({
  ACCEPTANCE_APP_ID: 'com.campfirium.foliole.android.acceptance', removeA5AcceptanceApplication: vi.fn()
}));
const roots = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); vi.clearAllMocks(); });

it.each([false, true])('runs only the image scenario and cleans its acceptance package after failure=%s', async fail => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-image-scope-')); roots.push(root);
  const session = { close: vi.fn(async () => {}), invoke: vi.fn() };
  const openSession = vi.fn(async () => session);
  const mechanics = vi.fn();
  const imageScenario = vi.fn(async () => { if (fail) throw new Error('scenario_failed'); });
  const args = { scenario: 'image-content', assertFixed: vi.fn(), buildIdentity: () => 'run',
    checked: vi.fn(), markMutationBoundary: vi.fn(), paths: { artifactsRoot: root, buildRoot: '/capsule' } };
  const action = runMacosA5SinglePrincipalSyncGroupEntry(args, { openSession, mechanics, imageScenario });
  if (fail) await expect(action).rejects.toThrow('scenario_failed'); else await action;
  expect(buildA5TwoDeviceAcceptance).toHaveBeenCalledOnce();
  expect(openSession).toHaveBeenCalledWith(expect.objectContaining({
    libraryHome: path.join(root, 'a5-image-content-sync/run/macos-library'), repoRoot: '/capsule'
  }));
  expect(imageScenario).toHaveBeenCalledOnce();
  expect(session.close).toHaveBeenCalledOnce();
  expect(removeA5AcceptanceApplication).toHaveBeenCalledTimes(2);
  expect(args.checked).not.toHaveBeenCalled();
  expect(session.invoke).not.toHaveBeenCalled();
  expect(mechanics).not.toHaveBeenCalled();
});

it('keeps the image scenario on the existing formal capsule and device lease contract without main-data backup', () => {
  expect(assertRegisteredMacosA5Action('image-content-sync')).toMatchObject({
    deviceLeaseMode: 'mutation', formalSourceClass: 'frozen-build', requiresHiddenDesktopRuntime: true,
    mutatesFixedA5: false, formalEvidence: { kind: 'run-directory', root: 'a5-image-content-sync' }
  });
});

it('requires the original name and image key alongside the persisted body', () => {
  const content = '![image](asset://key.png)';
  const fact = { content, resource_references: JSON.stringify([{ storage_key: 'key.png', original_name: 'Source.png', role: 'image' }]) };
  expect(assertImageContentFact(fact, content, 'Source.png').original_name).toBe('Source.png');
  expect(() => assertImageContentFact(fact, content, 'Lost.png')).toThrow();
  expect(() => assertImageContentFact(fact, 'Edited body', 'Source.png')).toThrow();
});
