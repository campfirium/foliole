// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { writeFileIfChanged } from './write-file-if-changed.mjs';

const roots = [];
afterEach(() => Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))));

it('preserves an existing generated file when its bytes are unchanged', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-if-changed-'));
  roots.push(root);
  const filePath = path.join(root, 'generated.java');
  await fs.writeFile(filePath, 'stable\n', 'utf8');
  const fixed = new Date('2020-01-01T00:00:00Z');
  await fs.utimes(filePath, fixed, fixed);

  await expect(writeFileIfChanged(filePath, 'stable\n')).resolves.toBe(false);
  await expect(fs.stat(filePath)).resolves.toMatchObject({ mtimeMs: fixed.getTime() });
  await expect(writeFileIfChanged(filePath, 'changed\n')).resolves.toBe(true);
  await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('changed\n');
});
