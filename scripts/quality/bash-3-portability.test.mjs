import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FILES = [
  'scripts/quality/quality-gate-fast.sh',
  'scripts/quality/quality-gate-log.sh',
  'scripts/quality/quality-gate-failure-summary.sh',
  'scripts/npm-hardening-check.sh',
];

describe('Mac system Bash portability', () => {
  it.each(FILES)('%s avoids Bash 4 and GNU find-only constructs', async (file) => {
    const source = await readFile(path.resolve(file), 'utf8');
    expect(source).not.toMatch(/\bmapfile\b/u);
    expect(source).not.toMatch(/find[^\n]*-printf/u);
    expect(source).not.toMatch(/\btimeout\s+['"$0-9]/u);
  });
});
