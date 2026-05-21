import { markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';

import { markdownCompatibilityExtensions } from './markdownCompatibilityExtension';
import { markdownMathExtension } from './markdownMathExtension';
import { folioleMarkdownExtensions } from './markdownOblikeExtension';

export const folioleMarkdownParser = (markdownLanguage.parser as MarkdownParser).configure([
  ...markdownCompatibilityExtensions,
  markdownMathExtension,
  ...folioleMarkdownExtensions
]);
