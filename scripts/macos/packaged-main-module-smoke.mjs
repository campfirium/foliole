/* global process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PARSER_PROBE = `import(process.argv[1]).then(({ folioleMarkdownParser }) => {
  if (folioleMarkdownParser.parse('# package smoke').topNode.type.name !== 'Document') {
    throw new Error('Packaged Markdown parser returned an unexpected tree');
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });`;

export function verifyPackagedMainMarkdownParser(appPath, run = spawnSync) {
  const executable = path.join(appPath, 'Contents/MacOS/Foliole');
  const parser = path.join(appPath, 'Contents/Resources/app.asar/dist/lib/core/markdown/folioleMarkdownParser.js');
  const result = run(executable, ['--input-type=module', '-e', PARSER_PROBE, parser], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30_000
  });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`packaged main Markdown parser load failed${detail ? `: ${detail}` : ''}`);
  }
}
