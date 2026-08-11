import { describe, expect, it } from 'vitest';

import {
  isExplicitSimplifiedChineseLanguageTag,
  readPrimaryLanguage
} from './systemLanguage.js';

describe('system language contract', () => {
  it('recognizes only explicit simplified Chinese tags', () => {
    expect(isExplicitSimplifiedChineseLanguageTag('zh-CN')).toBe(true);
    expect(isExplicitSimplifiedChineseLanguageTag('zh_Hans')).toBe(true);
    expect(isExplicitSimplifiedChineseLanguageTag('zh-SG')).toBe(true);
    expect(isExplicitSimplifiedChineseLanguageTag('zh')).toBe(false);
    expect(isExplicitSimplifiedChineseLanguageTag('zh-TW')).toBe(false);
    expect(isExplicitSimplifiedChineseLanguageTag('zh-Hant')).toBe(false);
  });

  it('reads only the first preferred language', () => {
    expect(readPrimaryLanguage(['ko-KR', 'zh-CN'])).toBe('ko-KR');
    expect(readPrimaryLanguage([])).toBe('');
  });
});
