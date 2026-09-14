import { describe, expect, it } from 'vitest';

import { cleanFormatting } from './formatCleanup';
import { createDefaultFormatCleanupSettings, createEmptyCustomCleanupRule } from './formatCleanupDefaults';

describe('cleanFormatting', () => {
  it('removes common line-start formatting and indentation', () => {
    const input = '### Heading\n  - First\n\t+ Second\n> Quote\n\n\n\nEnd';

    expect(cleanFormatting(input, createDefaultFormatCleanupSettings())).toBe(
      'Heading\nFirst\nSecond\nQuote\n\nEnd'
    );
  });

  it('keeps inline asterisks unless the user adds a custom rule', () => {
    expect(cleanFormatting('*italic* and **bold** and 3 * 5', createDefaultFormatCleanupSettings())).toBe(
      '*italic* and **bold** and 3 * 5'
    );
  });

  it('does not clean URLs, inline code, or fenced code', () => {
    const input = 'https://example.com/*path*\n`*code*`\n```md\n  - keep\n```\n- clean';

    expect(cleanFormatting(input, createDefaultFormatCleanupSettings())).toBe(
      'https://example.com/*path*\n`*code*`\n```md\n  - keep\n```\nclean'
    );
  });

  it('keeps protected text intact even when a custom expression matches ordinary characters', () => {
    const settings = createDefaultFormatCleanupSettings();
    settings.builtInRules = [];
    settings.customRules = [{ ...createEmptyCustomCleanupRule('letters'), find: '/[a-z]+/i', replace: 'x' }];

    expect(cleanFormatting('word `code` https://example.com/path', settings)).toBe(
      'x `code` https://example.com/path'
    );
  });

  it('supports visible whitespace tokens and slash-delimited regular expressions', () => {
    const settings = createDefaultFormatCleanupSettings();
    settings.builtInRules = [];
    settings.removeIndentation = false;
    settings.collapseBlankLines = false;
    settings.customRules = [
      { ...createEmptyCustomCleanupRule('spaces'), find: '/ {2,}/', replace: '␣' },
      { ...createEmptyCustomCleanupRule('break'), find: '↵↵', replace: '↵' }
    ];

    expect(cleanFormatting('A   B\n\nC', settings)).toBe('A B\nC');
  });
});
