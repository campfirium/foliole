import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

it('runs the packaged CLI through Foliole Electron without a system Node dependency', async () => {
  const source = await readFile(path.resolve('build', 'cli', 'foliole.cmd'), 'utf8');

  expect(source).toContain('set "ELECTRON_RUN_AS_NODE=1"');
  expect(source).toContain('set "FOLIOLE_PRODUCT_METADATA_PATH=%~dp0..\\resources\\app.asar\\package.json"');
  expect(source).toContain('"%~dp0..\\Foliole.exe" "%~dp0..\\resources\\scripts\\agent-control\\foliole-agent.mjs" %*');
  expect(source).toContain('exit /b %ERRORLEVEL%');
  expect(source).not.toMatch(/\bnode(?:\.exe)?\b/iu);
});
