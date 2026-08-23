// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

it('pins Java and Gradle generated text to LF on every host', () => {
  const attributes = fs.readFileSync('.gitattributes', 'utf8').split(/\r?\n/u);
  expect(attributes).toContain('*.java text eol=lf');
  expect(attributes).toContain('*.gradle text eol=lf');
});
