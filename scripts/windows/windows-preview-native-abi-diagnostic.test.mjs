// @vitest-environment node
/* global process */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PREVIEW_SCRIPT = path.resolve(process.cwd(), 'scripts/windows/windows-preview-native.mjs');

describe('windows native preview ABI diagnostics', () => {
  it('reports native ABI preflight failure without auto-rebuilding during preview', async () => {
    const script = await readFile(PREVIEW_SCRIPT, 'utf8');

    expect(script).toContain('verify Electron native ABI');
    expect(script).not.toContain('Electron native ABI mismatch detected; restoring better-sqlite3 for Electron');
    expect(script).not.toContain("npmRunCommand('electron:rebuild:native')");
    expect(script).not.toContain('verify restored Electron native ABI');
  });

  it('falls back to direct restart when an old shell never delivers restart intent', async () => {
    const script = await readFile(PREVIEW_SCRIPT, 'utf8');

    expect(script).toContain('restart delivery missing after intent request; falling back to direct restart');
    expect(script).toContain('restart markers missing after intent delivery; falling back to direct restart');
    expect(script).toContain("runClientAction('restart')");
    expect(script).toContain('selected action: direct-restart');
  });

  it('bounds native client actions and verifies the final trusted runtime status', async () => {
    const script = await readFile(PREVIEW_SCRIPT, 'utf8');

    expect(script).toContain('WINDOWS_CLIENT_ACTION_TIMEOUT_MS');
    expect(script).toContain('timeoutMs: CLIENT_ACTION_TIMEOUT_MS');
    expect(script).toContain("waitForTrustedRunning(`${action} status`, currentHead)");
    expect(script).toContain("waitForTrustedRunning('direct restart status')");
  });
});
