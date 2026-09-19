import { markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';

import { markdownCompatibilityExtensions } from './markdownCompatibilityExtension.js';
import { markdownMathExtension } from './markdownMathExtension.js';
import { folioleMarkdownExtensions } from './markdownOblikeExtension.js';

export const folioleMarkdownLanguageExtensions = [
  ...markdownCompatibilityExtensions,
  markdownMathExtension,
  ...folioleMarkdownExtensions
];

export const folioleMarkdownParser = (markdownLanguage.parser as MarkdownParser).configure(folioleMarkdownLanguageExtensions);
