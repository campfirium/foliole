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
});
