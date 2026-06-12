import { markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';

import { markdownCompatibilityExtensions } from './markdownCompatibilityExtension';
import { markdownMathExtension } from './markdownMathExtension';
import { folioleMarkdownExtensions } from './markdownOblikeExtension';

export const folioleMarkdownLanguageExtensions = [
  ...markdownCompatibilityExtensions,
  markdownMathExtension,
  ...folioleMarkdownExtensions
];

export const folioleMarkdownParser = (markdownLanguage.parser as MarkdownParser).configure(folioleMarkdownLanguageExtensions);
