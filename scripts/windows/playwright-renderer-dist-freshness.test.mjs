// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertRendererDistFresh,
  getRendererDistFreshness
} from './playwright-renderer-dist-freshness.mjs';

function createRendererFreshnessFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-renderer-freshness-'));
  const srcRoot = path.join(root, 'src', 'app');
  const distRoot = path.join(root, 'dist');
  fs.mkdirSync(srcRoot, { recursive: true });
  fs.mkdirSync(distRoot, { recursive: true });
  const sourceFile = path.join(srcRoot, 'App.tsx');
  const testFile = path.join(srcRoot, 'App.test.tsx');
  const rendererIndexPath = path.join(distRoot, 'index.html');
  fs.writeFileSync(sourceFile, 'export function App() { return null; }\n');
  fs.writeFileSync(testFile, 'it("does not affect renderer freshness", () => {});\n');
  fs.writeFileSync(rendererIndexPath, '<div id="root"></div>\n');
  return { rendererIndexPath, root, sourceFile, testFile };
}

describe('playwright renderer dist freshness', () => {
  it('detects stale renderer dist before launching desktop Playwright', () => {
    const { rendererIndexPath, root, sourceFile } = createRendererFreshnessFixture();
    fs.utimesSync(rendererIndexPath, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));
    fs.utimesSync(sourceFile, new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z'));
    const target = { appRoot: root, rendererIndexPath };

    expect(getRendererDistFreshness(target)).toMatchObject({ stale: true });
    expect(() => assertRendererDistFresh(target, {})).toThrow(
      'Run `npm run desktop:test:windows -- <spec>` so Windows dist is rebuilt before Playwright.'
    );
  });

  it('ignores test-only source freshness when checking renderer dist', () => {
    const { rendererIndexPath, root, sourceFile, testFile } = createRendererFreshnessFixture();
    fs.utimesSync(rendererIndexPath, new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z'));
    fs.utimesSync(sourceFile, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));
    fs.utimesSync(testFile, new Date('2026-01-03T00:00:00.000Z'), new Date('2026-01-03T00:00:00.000Z'));

    expect(getRendererDistFreshness({ appRoot: root, rendererIndexPath })).toMatchObject({ stale: false });
  });

  it('allows explicitly marked stale renderer diagnostics', () => {
    const { rendererIndexPath, root, sourceFile } = createRendererFreshnessFixture();
    fs.utimesSync(rendererIndexPath, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));
    fs.utimesSync(sourceFile, new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z'));

    expect(() =>
      assertRendererDistFresh(
        { appRoot: root, rendererIndexPath },
        { FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1' }
      )
    ).not.toThrow();
  });
});
