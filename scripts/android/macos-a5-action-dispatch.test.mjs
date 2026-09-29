import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';

it('runs the sync acceptance controller from the same source root as its APK', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-frozen-dispatch-'));
  const actionDirectory = path.join(root, 'scripts/android');
  const marker = path.join(root, 'controller-source.json');
  fs.mkdirSync(actionDirectory, { recursive: true });
  fs.writeFileSync(path.join(actionDirectory, 'macos-a5-single-principal-sync-group-entry.mjs'),
    `import fs from 'node:fs';
export async function runMacosA5SinglePrincipalSyncGroupEntry(args) {
  fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify(args.paths));
}
`);
  try {
    const paths = { acceptedRevision: 'frozen-tip', buildRoot: root };
    const entry = pathToFileURL(path.resolve('scripts/android/macos-a5-action-dispatch.mjs')).href;
    execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { dispatchMacosA5Action } from ${JSON.stringify(entry)};
await dispatchMacosA5Action({ action: 'single-principal-sync-group',
  paths: ${JSON.stringify(paths)},
  assertFixed: () => { throw new Error('Unfrozen controller was executed.'); }
});`]);
    expect(JSON.parse(fs.readFileSync(marker, 'utf8'))).toEqual(paths);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
