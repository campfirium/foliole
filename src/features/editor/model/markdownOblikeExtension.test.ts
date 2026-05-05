import { describe, expect, it } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';

function collectNodeNames(markdown: string) {
  const names = new Set<string>();
  folioleMarkdownParser.parse(markdown).cursor().iterate((node) => {
    names.add(node.name);
  });
  return names;
}

describe('markdownOblikeExtension Markdown Compatibility', () => {
  it('recognizes Markdown Compatibility lenient strong emphasis before adjacent text', () => {
    const names = collectNodeNames('**实操含义：**如果你的应用场景');

    expect(names).toContain('LenientStrongEmphasis');
    expect(names).toContain('EmphasisMark');
  });

  it('leaves standard strong emphasis on the base parser path', () => {
    const names = collectNodeNames('**123**dsafdasdfasdf');

    expect(names).toContain('StrongEmphasis');
    expect(names).not.toContain('LenientStrongEmphasis');
  });
});

describe('markdownOblikeExtension', () => {
  it('recognizes OB-like footnote nodes', () => {
    const names = collectNodeNames('Weight^[1]{note} matters.');

    expect(names).toContain('Footnote');
    expect(names).toContain('FootnoteLabel');
    expect(names).toContain('FootnoteNote');
    expect(names).toContain('FootnoteMark');
  });

  it('recognizes OB-like callout marker nodes', () => {
    const names = collectNodeNames('> [!note] Title');

    expect(names).toContain('CalloutMarker');
    expect(names).toContain('CalloutKind');
    expect(names).toContain('CalloutMark');
  });

  it('recognizes OB-like callout fold markers', () => {
    const names = collectNodeNames('> [!warning]- Folded title');

    expect(names).toContain('CalloutMarker');
    expect(names).toContain('CalloutKind');
    expect(names).toContain('CalloutFold');
  });

  it('recognizes OB-like wiki link nodes', () => {
    const names = collectNodeNames('Open [[Page|Alias]]');

    expect(names).toContain('WikiLink');
    expect(names).toContain('WikiLinkTarget');
    expect(names).toContain('WikiLinkAlias');
    expect(names).toContain('WikiLinkMark');
  });

  it('recognizes OB-like embed nodes separately from wiki links', () => {
    const names = collectNodeNames('Open ![[Page|Alias]]');

    expect(names).toContain('Embed');
    expect(names).toContain('EmbedTarget');
    expect(names).toContain('EmbedAlias');
    expect(names).toContain('EmbedMark');
    expect(names).not.toContain('WikiLink');
  });

  it('keeps standard images and link references parseable while embed parsing is enabled', () => {
    const names = collectNodeNames('![alt](x.png)\n\n[img]: https://example.com/x.png');

    expect(names).toContain('Image');
    expect(names).toContain('LinkReference');
    expect(names).toContain('URL');
  });

  it('does not parse wiki links inside inline code', () => {
    const names = collectNodeNames('`[[Page]]`');

    expect(names).not.toContain('WikiLink');
    expect(names).toContain('InlineCode');
  });

  it('recognizes OB-like source highlight nodes', () => {
    const names = collectNodeNames('A ==marked== word');

    expect(names).toContain('SourceHighlight');
    expect(names).toContain('SourceHighlightMark');
  });

  it('does not parse source highlights inside inline code', () => {
    const names = collectNodeNames('`==marked==`');

    expect(names).not.toContain('SourceHighlight');
    expect(names).toContain('InlineCode');
  });
});
