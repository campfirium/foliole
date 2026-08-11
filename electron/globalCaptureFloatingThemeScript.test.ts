// @vitest-environment node

import { expect, it } from 'vitest';

import {
  buildFloatingThemeReadScript,
  buildFloatingThemeStringsScript
} from './globalCaptureFloatingThemeScript.js';

it('builds a syntactically valid floating theme read script', () => {
  expect(() => new Function(buildFloatingThemeReadScript())).not.toThrow();
});

it('uses only the primary system language unless Chinese is explicit', () => {
  expect(readStrings(['ko-KR', 'zh-CN'], null).locale).toBe('en');
  expect(readStrings(['zh-TW'], null).locale).toBe('en');
  expect(readStrings(['zh'], null).locale).toBe('en');
  expect(readStrings([], null).locale).toBe('en');
  expect(readStrings(['zh-CN'], null).locale).toBe('zh-Hans');
  expect(readStrings(['ko-KR'], 'zh-Hans').locale).toBe('zh-Hans');
  expect(readStrings(['zh-CN'], 'en').locale).toBe('en');
});

function readStrings(languages: string[], preference: string | null) {
  const read = new Function(
    'navigator',
    'localStorage',
    `return ${buildFloatingThemeStringsScript()}`
  ) as (navigator: unknown, localStorage: unknown) => { locale: string };
  return read(
    { language: languages[0] ?? '', languages },
    { getItem: () => preference }
  );
}
