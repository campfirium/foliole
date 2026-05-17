// @vitest-environment node

import { expect, it } from 'vitest';

import type { ImageIntrinsicSize } from './imageIntrinsicSize.js';
import { layoutLocalizedMarkdownImage } from './localizedMarkdownImageLayout.js';

const largeSize = { height: 960, width: 1280 };
const smallSize = { height: 24, width: 24 };

function layout(markdown: string, imageMarkdown = '![](asset://image.jpg)', size: ImageIntrinsicSize | null = largeSize) {
  const raw = '![](https://cdn.example.com/image.jpg)';
  const from = markdown.indexOf(raw);
  const result = layoutLocalizedMarkdownImage({
    imageMarkdown,
    markdown,
    range: { from, to: from + raw.length },
    size,
    textBeforeImage: markdown.slice(0, from)
  });
  return `${result.before}${result.image}${markdown.slice(result.cursor)}`;
}

it('moves a large image after inline text onto an independent block', () => {
  expect(layout('Lead text ![](https://cdn.example.com/image.jpg)')).toBe('Lead text\n\n![](asset://image.jpg)');
});

it('moves a large image before inline text onto an independent block', () => {
  expect(layout('![](https://cdn.example.com/image.jpg) trailing text')).toBe('![](asset://image.jpg)\n\ntrailing text');
});

it('separates a large image from text on both sides', () => {
  expect(layout('Lead ![](https://cdn.example.com/image.jpg) trailing')).toBe('Lead\n\n![](asset://image.jpg)\n\ntrailing');
});

it('keeps a large image unchanged when it already occupies its own line', () => {
  expect(layout('Lead\n\n![](https://cdn.example.com/image.jpg)\n\ntrailing')).toBe('Lead\n\n![](asset://image.jpg)\n\ntrailing');
});

it('keeps small and unknown-size images inline', () => {
  expect(layout('Lead ![](https://cdn.example.com/image.jpg) trailing', '![](asset://small.jpg)', smallSize)).toBe(
    'Lead ![](asset://small.jpg) trailing'
  );
  expect(layout('Lead ![](https://cdn.example.com/image.jpg) trailing', '![](asset://unknown.jpg)', null)).toBe(
    'Lead ![](asset://unknown.jpg) trailing'
  );
});
