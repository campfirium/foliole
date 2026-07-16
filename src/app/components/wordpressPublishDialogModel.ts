import {
  extractWordPressPublishTitle,
  readWordPressPostBinding
} from '../../../lib/core/wordpress/wordpressFrontmatter';

export interface WordPressPublishDetails {
  mode: 'create' | 'update';
  parseError: string | null;
  title: string;
  url: string | null;
}

export function readWordPressPublishDetails(content: string, fallbackTitle: string): WordPressPublishDetails {
  try {
    const binding = readWordPressPostBinding(content);
    return {
      mode: binding ? 'update' : 'create',
      parseError: null,
      title: extractWordPressPublishTitle(content, fallbackTitle),
      url: binding?.url ?? null
    };
  } catch (error) {
    return {
      mode: 'create',
      parseError: error instanceof Error ? error.message : 'Invalid WordPress publish frontmatter.',
      title: fallbackTitle,
      url: null
    };
  }
}
