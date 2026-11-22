import { expect, it } from 'vitest';

import { resolveClozeAnswerTexts, toBreadcrumbTitleText } from './breadcrumbTitleText';

it('drops inline Markdown marks and heading or tag hashes but keeps C#', () => {
  expect(toBreadcrumbTitleText('### **Bold** and `code` #tag in C#')).toBe('Bold and code tag in C#');
  expect(toBreadcrumbTitleText('[Link](https://example.com) ![](a.png)')).toBe('Link');
});

it('shows a cloze gap as one *', () => {
  expect(toBreadcrumbTitleText('The [...] of light')).toBe('The * of light');
  expect(toBreadcrumbTitleText('[...]')).toBe('*');
});

it('hides answer texts, also when the title kept their Markdown marks', () => {
  expect(toBreadcrumbTitleText('光合作用发生在**叶绿体**中', ['叶绿体'])).toBe('光合作用发生在*中');
  expect(toBreadcrumbTitleText('A **b** c', ['**b**'])).toBe('A * c');
});

it('reads cloze answers from text locators, ranges and a placeholder reveal', () => {
  expect(resolveClozeAnswerTexts({ anchorLink: { kind: 'cloze', locator: { ranges: [{ originalText: 'x' }, { originalText: 'y' }] } } })).toEqual(['x', 'y']);
  expect(resolveClozeAnswerTexts({ anchorLink: null, content: 'a [...] b', reveal: 'z' })).toEqual(['z']);
  expect(resolveClozeAnswerTexts({ anchorLink: { kind: 'highlight', locator: { originalText: 'x' } }, content: 'x', reveal: 'q' })).toEqual([]);
});
