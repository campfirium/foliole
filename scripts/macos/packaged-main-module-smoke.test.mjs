import { expect, it, vi } from 'vitest';

import {
  verifyPackagedMainMarkdownParser,
  verifyPackagedMirrorRenderWorker
} from './packaged-main-module-smoke.mjs';

it('loads the real packaged parser through the app executable without starting the UI', () => {
  const run = vi.fn(() => ({ status: 0, stdout: '', stderr: '' }));

  verifyPackagedMainMarkdownParser('/artifacts/Foliole.app', run);

  const [executable, args, options] = run.mock.calls[0];
  expect(executable).toBe('/artifacts/Foliole.app/Contents/MacOS/Foliole');
  expect(args.at(-1)).toBe(
    '/artifacts/Foliole.app/Contents/Resources/app.asar/dist/lib/core/markdown/folioleMarkdownParser.js'
  );
  expect(args).toContain('--input-type=module');
  expect(options.env.ELECTRON_RUN_AS_NODE).toBe('1');
  expect(options.timeout).toBe(30_000);
});

it('rejects a package whose main parser dependency cannot resolve', () => {
  const run = () => ({
    status: 1,
    stderr: "ERR_MODULE_NOT_FOUND: Cannot find package '@codemirror/lang-markdown'"
  });

  expect(() => verifyPackagedMainMarkdownParser('/artifacts/Foliole.app', run))
    .toThrow('packaged main Markdown parser load failed: ERR_MODULE_NOT_FOUND');
});

it('runs the real packaged mirror worker in Electron-as-Node', () => {
  const run = vi.fn(() => ({ status: 0, stdout: '', stderr: '' }));

  verifyPackagedMirrorRenderWorker('/artifacts/Foliole.app', run);

  const [executable, args, options] = run.mock.calls[0];
  expect(executable).toBe('/artifacts/Foliole.app/Contents/MacOS/Foliole');
  expect(args.at(-1)).toBe(
    '/artifacts/Foliole.app/Contents/Resources/app.asar/dist/electron/mirror/articleMirrorRenderWorker.js'
  );
  expect(args.at(-2)).toContain('execArgv: []');
  expect(options.env.ELECTRON_RUN_AS_NODE).toBe('1');
});

it('rejects a package whose mirror worker imports Electron APIs', () => {
  const run = () => ({ status: 1, stderr: "The requested module 'electron' does not provide an export named 'app'" });

  expect(() => verifyPackagedMirrorRenderWorker('/artifacts/Foliole.app', run))
    .toThrow('packaged mirror worker render failed: The requested module');
});
