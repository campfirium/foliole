// @vitest-environment node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('checks an explicitly requested Lab script while ordinary lint keeps excluding Lab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-private-files-'));
  const runner = path.resolve('scripts/lint-changed.mjs');
  try {
    fs.mkdirSync(path.join(root, '.lab/scripts'), { recursive: true });
    fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(root, 'eslint.config.mjs'), `export default [
      { ignores: ['.lab/**'] }, { rules: { 'no-undef': 'error' } }
    ];`);
    const file = '.lab/scripts/invalid.mjs';
    fs.writeFileSync(path.join(root, file), 'unknownValue();\n');
    const explicit = spawnSync(process.execPath, [runner, '--explicit', file], {
      cwd: root, encoding: 'utf8'
    });
    expect(explicit.status, explicit.stdout + explicit.stderr).toBe(1);
    expect(explicit.stdout + explicit.stderr).toContain('no-undef');
    const ordinary = spawnSync(process.execPath, [runner], {
      cwd: root, encoding: 'utf8', env: { ...process.env, LINT_CHANGED_FILES: file }
    });
    expect(ordinary.status, ordinary.stdout + ordinary.stderr).toBe(0);
    expect(ordinary.stdout + ordinary.stderr).toContain('ignored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
