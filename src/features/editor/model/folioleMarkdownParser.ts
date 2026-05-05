import { markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';

import { folioleMarkdownExtensions } from './markdownOblikeExtension';

export const folioleMarkdownParser = (markdownLanguage.parser as MarkdownParser).configure(folioleMarkdownExtensions);
