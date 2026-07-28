// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { prepareAndroidLabCheckout } from './windows-android-lab-checkout.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'f'.repeat(40);

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-lab-checkout-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  paths.checkout = path.join(root, 'checkout');
  paths.candidate = paths.checkout;
  paths.preview = paths.checkout;
  paths.workspaceDeployment = path.join(paths.checkout, '.foliole-android-lab-deployment.json');
  fs.mkdirSync(paths.repository, { recursive: true });
  fs.writeFileSync(path.join(paths.repository, 'HEAD'), 'ref: refs/heads/lab/dev\n');
  return paths;
}

describe('Windows Android Lab checkout', () => {
  it('updates one persistent work-tree without creating a Git worktree', async () => {
    const paths = fixture();
    const calls = [];
    await prepareAndroidLabCheckout({ gitPath: 'git.exe' }, paths, SHA, async (command, args) => {
      calls.push({ args, command });
      if (args.includes('status')) {
        return { code: 0, lines: ['?? ignored-build-output'], output: '?? ignored-build-output\n' };
      }
      return { code: 0, lines: [], output: '' };
    }, 'scratch');
    expect(calls.some((call) => call.args.includes('worktree'))).toBe(false);
    expect(calls.some((call) => call.args.includes('--work-tree') && call.args.includes(paths.checkout))).toBe(true);
    expect(calls.some((call) => call.args.includes('checkout') && call.args.includes('--force'))).toBe(true);
    expect(readJson(paths.checkoutState)).toMatchObject({
      checkoutHead: SHA,
      path: paths.checkout,
      schemaVersion: 1,
      sourceKind: 'scratch'
    });
  });

  it('allows generator-owned tracked output but blocks tracked source edits', async () => {
    const paths = fixture();
    await expect(prepareAndroidLabCheckout({ gitPath: 'git.exe' }, paths, SHA, async (_command, args) => {
      if (args.includes('status')) {
        return { code: 0, lines: [' M src/app/App.tsx'], output: ' M src/app/App.tsx\n' };
      }
      return { code: 0, lines: [], output: '' };
    })).rejects.toMatchObject({ code: 'checkout_dirty' });

    await prepareAndroidLabCheckout({ gitPath: 'git.exe' }, paths, SHA, async (_command, args) => {
      if (args.includes('status')) {
        return { code: 0, lines: [' M android/app/capacitor.build.gradle'], output: ' M android/app/capacitor.build.gradle\n' };
      }
      return { code: 0, lines: [], output: '' };
    });
    expect(readJson(paths.checkoutState)).toMatchObject({ dirty: 'generator_owned' });
  });

  it('allows tracked files that still match the recorded checkout head', async () => {
    const paths = fixture();
    const OLD = 'a'.repeat(40);
    writeJsonAtomic(paths.checkoutState, { checkoutHead: OLD, schemaVersion: 1 });
    let statusCalls = 0;
    await prepareAndroidLabCheckout({ gitPath: 'git.exe' }, paths, SHA, async (_command, args) => {
      if (args.includes('status')) {
        statusCalls += 1;
        const output = statusCalls === 1 ? ' M scripts/windows/windows-android-lab-operation.mjs\n' : '';
        return { code: 0, lines: output.trim().split(/\r?\n/u).filter(Boolean), output };
      }
      if (args.includes('hash-object')) return { code: 0, lines: ['old-blob'], output: 'old-blob\n' };
      if (args.includes('rev-parse') && args.includes(`${OLD}:scripts/windows/windows-android-lab-operation.mjs`)) {
        return { code: 0, lines: ['old-blob'], output: 'old-blob\n' };
      }
      return { code: 0, lines: [], output: '' };
    });
    expect(readJson(paths.checkoutState)).toMatchObject({ checkoutHead: SHA, dirty: 'clean' });
  });
});
