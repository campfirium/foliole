import { expect, it } from 'vitest';

import { getImageClipboardSource } from './imageClipboardSource';
import { collectImageMatches } from './markdownImageMatches';
import { collectMarkdownLinkReferences } from './markdownLinkReferences';

const asset = `asset://${'a'.repeat(64)}.png`;
function copy(content: string) {
  const image = collectImageMatches(0, content, collectMarkdownLinkReferences(content))[0]!;
  return getImageClipboardSource(content, image.from, image.to);
}

it('preserves the full inline image source including display properties and title', () => {
  const image = `![Diagram|320](${asset} "Original title")`;
  expect(copy(`Before\n\n${image}\n\nAfter`)?.markdown).toBe(image);
});

it.each(['![Diagram][pic]', '![pic][]', '![pic]'])('makes %s independent of reference definitions and target collisions', image => {
  const content = `Before\n\n${image}\n\n[pic]: <${asset}> "Image title"`;
  const result = copy(content)!;
  expect(result.markdown).toBe(`${image.slice(0, image.indexOf(']') + 1)}(<${asset}> "Image title")`);
  expect(collectImageMatches(0, `${result.markdown}\n\n[pic]: https://wrong.example/image.png`)[0]?.source).toBe(asset);
});

it('keeps an image-only reference link self contained without changing the source document', () => {
  const content = `[![Diagram|320][pic]][site]\n\n[pic]: ${asset} "Image title"\n[site]: https://example.com "Site title"`;
  expect(copy(content)?.markdown).toBe(`[![Diagram|320](${asset} "Image title")](https://example.com "Site title")`);
});

it.each(['before ', ''])('does not copy surrounding text from a mixed link (%s)', prefix => {
  const image = `![Diagram](${asset})`;
  expect(copy(`[${prefix}${image} after](https://example.com)`)?.markdown).toBe(image);
});

it('refuses stale ranges and plain text or code that resembles an image', () => {
  const markdown = `![Diagram](${asset})`;
  expect(getImageClipboardSource(`\`${markdown}\``, 1, markdown.length + 1)).toBeNull();
  expect(getImageClipboardSource(markdown, 1, markdown.length)).toBeNull();
  expect(getImageClipboardSource('Text', 0, 4)).toBeNull();
});

it('copies only the pressed image when multiple images share a link with text', () => {
  const first = `![First](${asset})`;
  const second = '![Second](https://example.com/second.png)';
  const content = `[${first} caption ${second}](https://example.com)`;
  const images = collectImageMatches(0, content);
  expect(images.map(image => getImageClipboardSource(content, image.from, image.to)?.markdown)).toEqual([first, second]);
});
