// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('demo site preview', () => {
  it('launches Astro preview through Node with hidden file-backed output', async () => {
    const script = await readFile(path.join(REPO_ROOT, 'scripts/windows/demo-site-preview.mjs'), 'utf8');

    expect(script).toContain("path.join(SITE_ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs')");
    expect(script).toContain('spawn(process.execPath');
    expect(script).toContain('shell: false');
    expect(script).toContain("stdio: ['ignore', out, err]");
    expect(script).toContain('windowsHide: true');
    expect(script).toContain("path.join(REPO_ROOT, '.tmp', 'demo-site-preview')");
    expect(script).toContain('DEMO_SITE_PREVIEW_URL');
    expect(script).toContain('isPreviewPortAvailable');
    expect(script).toContain('listeningPreviewPids');
    expect(script).toContain("spawnSync('netstat.exe'");
    expect(script).toContain("spawnSync('taskkill.exe'");
    expect(script).toContain('site preview port is occupied and could not be released');
    expect(script).not.toContain("'.bin', 'astro.cmd'");
    expect(script).not.toContain('127.0.0.1:4321');
  });
});
