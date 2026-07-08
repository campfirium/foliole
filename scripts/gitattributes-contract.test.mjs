// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const attributes = fs.readFileSync('.gitattributes', 'utf8');

describe('repository text attribute contract', () => {
  it('keeps script, workflow, and document text files on LF endings', () => {
    for (const pattern of [
      '*.cjs text eol=lf',
      '*.js text eol=lf',
      '*.json text eol=lf',
      '*.md text eol=lf',
      '*.mjs text eol=lf',
      '*.ps1 text eol=lf',
      '*.sh text eol=lf',
      '*.ts text eol=lf',
      '*.tsx text eol=lf',
      '*.yaml text eol=lf',
      '*.yml text eol=lf'
    ]) {
      expect(attributes).toContain(pattern);
    }
  });
});
