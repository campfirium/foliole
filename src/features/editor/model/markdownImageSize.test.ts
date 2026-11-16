import { describe, expect, it } from 'vitest';

import { collectImageMatches } from './markdownImageMatches';
import { createMarkdownImageFocusEdit, parseMarkdownImageLabelSize, setMarkdownImageDisplayWidth } from './markdownImageSize';

describe('Obsidian-compatible markdown image size', () => {
  it('separates a width suffix from accessible image text', () => {
    expect(parseMarkdownImageLabelSize('Cover|268')).toEqual({ alt: 'Cover', displayWidth: 268 });
    expect(parseMarkdownImageLabelSize('Cover|268x180')).toEqual({ alt: 'Cover|268x180' });
    expect(parseMarkdownImageLabelSize('Cover|wide')).toEqual({ alt: 'Cover|wide' });
  });

  it('adds, replaces, and removes a width suffix without changing the image target', () => {
    const markdown = 'Before\n![Cover](asset://hash-1.png)\nAfter';
    const from = markdown.indexOf('![Cover]');
    const to = from + '![Cover](asset://hash-1.png)'.length;

    const sized = setMarkdownImageDisplayWidth({ imageRange: { from, to }, markdown, width: 268 });
    expect(sized).toBe('Before\n![Cover|268](asset://hash-1.png)\nAfter');
    expect(setMarkdownImageDisplayWidth({
      imageRange: { from, to: to + 4 },
      markdown: sized!,
      width: 320
    })).toBe('Before\n![Cover|320](asset://hash-1.png)\nAfter');
    expect(setMarkdownImageDisplayWidth({
      imageRange: { from, to: to + 4 },
      markdown: sized!,
      width: null
    })).toBe(markdown);
  });

  it('updates an image inside a wrapping link without changing the link', () => {
    const markdown = '[![Cover](asset://hash-1.png)](https://example.com/post)';
    expect(setMarkdownImageDisplayWidth({
      imageRange: { from: 0, to: markdown.length },
      markdown,
      width: 240
    })).toBe('[![Cover|240](asset://hash-1.png)](https://example.com/post)');
  });
});

it('writes focus on one repeated image without losing its alt text or width when resized', () => {
  const image = '![Cover|268](asset://hash-1.png)';
  const original = `${image}\n\n${image}`;
  const focus = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
  const edit = createMarkdownImageFocusEdit({ markdown: original, imageRange: { from: 0, to: image.length }, focus });
  expect(edit).not.toBeNull();
  const markdown = original.slice(0, edit!.from) + edit!.insert + original.slice(edit!.to);
  const show = collectImageMatches(0, markdown);
  expect(show).toHaveLength(2);
  expect(show[0]).toMatchObject({ alt: 'Cover', displayWidth: 268, focus });
  expect(show[1]?.focus).toBeUndefined();
  const resized = setMarkdownImageDisplayWidth({ imageRange: show[0]!, markdown, width: 320 });
  expect(collectImageMatches(0, resized!)[0]).toMatchObject({ alt: 'Cover', displayWidth: 320, focus });
  expect(resized?.split('\n\n')[1]).toBe(image);
});
