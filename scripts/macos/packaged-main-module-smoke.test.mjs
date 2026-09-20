import { expect, it, vi } from 'vitest';

import { verifyPackagedMainMarkdownParser } from './packaged-main-module-smoke.mjs';

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
