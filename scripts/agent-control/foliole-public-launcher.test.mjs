import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

it('runs the Windows packaged CLI through Foliole Electron without a system Node dependency', async () => {
  const source = await readFile(path.resolve('build', 'cli', 'foliole.cmd'), 'utf8');

  expect(source).toContain('set "ELECTRON_RUN_AS_NODE=1"');
  expect(source).toContain('set "FOLIOLE_PRODUCT_METADATA_PATH=%~dp0..\\resources\\app.asar\\package.json"');
  expect(source).toContain('"%~dp0..\\Foliole.exe" "%~dp0..\\resources\\scripts\\agent-control\\foliole-agent.mjs" %*');
  expect(source).toContain('exit /b %ERRORLEVEL%');
  expect(source).not.toMatch(/\bnode(?:\.exe)?\b/iu);
  expect(source).not.toContain('build/cli/foliole');
});

it('runs the macOS MAS packaged CLI with the container descriptor and bundled Electron', async () => {
  const source = await readFile(path.resolve('build', 'cli', 'foliole'), 'utf8');

  expect(source).toMatch(/^#!\/bin\/sh/u);
  expect(source).toContain('ELECTRON_RUN_AS_NODE=1');
  expect(source).toContain('FOLIOLE_PRODUCT_METADATA_PATH:=$FOLIOLE_CLI_CONTENTS_DIR/Resources/app.asar/package.json');
  expect(source).toContain('$HOME/Library/Containers/com.campfirium.foliole/Data/Library/Application Support/foliole/cache/agent-control-session.json');
  expect(source).toContain('"$FOLIOLE_CLI_CONTENTS_DIR/MacOS/Foliole"');
  expect(source).toContain('"$FOLIOLE_CLI_CONTENTS_DIR/Resources/scripts/agent-control/foliole-agent.mjs" "$@"');
  expect(source).not.toMatch(/\bnode(?:\.exe)?\b/iu);
  expect(source).not.toContain('foliole.cmd');
});
