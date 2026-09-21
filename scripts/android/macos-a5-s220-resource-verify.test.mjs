import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { prepareS220EvidenceRoot } from './macos-a5-s220-evidence-root.mjs';

it('creates the runtime log directory before opening the resource session', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-s220-resource-'));
  const root = path.join(temporary, 'final-same-tip', 'a5-resource');
  const receipt = path.join(root, 'receipt.json');
  try {
    prepareS220EvidenceRoot(root, receipt);
    expect(fs.statSync(root).isDirectory()).toBe(true);
    fs.writeFileSync(receipt, '{}\n');
    expect(() => prepareS220EvidenceRoot(root, receipt)).toThrow(/already exists/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
