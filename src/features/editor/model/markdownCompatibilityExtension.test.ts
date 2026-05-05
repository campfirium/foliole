import { describe, expect, it } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';

function collectNodeNames(markdown: string) {
  const names = new Set<string>();
  folioleMarkdownParser.parse(markdown).cursor().iterate((node) => {
    names.add(node.name);
  });
  return names;
}

describe('markdownCompatibilityExtension', () => {
  it('recognizes lenient strong emphasis before adjacent text', () => {
    const names = collectNodeNames('**实操含义：**如果你的应用场景');

    expect(names).toContain('LenientStrongEmphasis');
    expect(names).toContain('EmphasisMark');
  });

  it('leaves standard strong emphasis on the base parser path', () => {
    const names = collectNodeNames('**123**dsafdasdfasdf');

    expect(names).toContain('StrongEmphasis');
    expect(names).not.toContain('LenientStrongEmphasis');
  });

  it('recognizes a whole-line strong-wrapped ATX heading as Markdown Compatibility', () => {
    const names = collectNodeNames('**# Android Sync Performance Analysis**');

    expect(names).toContain('LenientStrongATXHeading');
    expect(names).toContain('HeaderMark');
    expect(names).toContain('EmphasisMark');
  });

  it('does not treat inline strong-wrapped hashes as headings', () => {
    const names = collectNodeNames('Intro **# tag** text');

    expect(names).not.toContain('LenientStrongATXHeading');
    expect(names).toContain('StrongEmphasis');
  });
});
