/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'android/app/src/androidTest/java/com/foliole/android/FolioleS220ResourceDiagnosticTest.java'), 'utf8');

it('keeps the final S220 timeline diagnostic passive and bounded', () => {
  expect(source).toContain('MutationObserver');
  expect(source).toContain('timeline');
  expect(source).toContain("entry.terminal='ready'");
  expect(source).toContain("entry.terminal='unavailable'");
  expect(source).toContain("out[hash].terminal='timeout'");
  expect(source).toContain('},90000)');
  expect(source).not.toMatch(/fetch\(|\.decode\(|scroll|\.click\(|reload|new Image/u);
});
