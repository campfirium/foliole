import { expect, it } from 'vitest';

import { capBreadcrumbLabel } from './breadcrumbLabel';

it.each([
  ['Atomic Habits', 'Atomic Habits'],
  ['Chapter 12: The Law of Least Effort', 'Chapter 12…'],
  ['Part 3: The 3rd Law', 'Part 3…'],
  ['The Most Effective Form of Learning', 'The Most…'],
  ['Supercalifragilisticexpialidocious', 'Supercalifra…'],
  ['书籍', '书籍'],
  ['阅读：化整为零', '阅读：化整为零'],
  ['掌控习惯：一个简单可行的自我提升方法', '掌控习惯…'],
  ['一个简单可行的自我提升方法', '一个简单可行…'],
  ['第1章 微习惯的惊人力量', '第1章 微习惯…'],
  ['欢迎使用 Foliole', '欢迎使用…'],
  ['Foliole 使用指南大全', 'Foliole 使用…'],
  ['  Inbox  ', 'Inbox']
])('caps %s to %s', (title, label) => {
  expect(capBreadcrumbLabel(title)).toBe(label);
});
