import { describe, expect, it } from 'vitest';

import { collectImageMatches } from './markdownImageMatches';
import { createMarkdownImageCropEdit, createMarkdownImageFocusEdit, parseMarkdownImageLabelSize, setMarkdownImageDisplayWidth } from './markdownImageSize';

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

it('keeps crop, focus, and width independent when editing a moved, linked image occurrence', () => {
  const source = 'asset://' + 'a'.repeat(64) + '.png';
  const image = `[![Cover|268;focus=1000,2000,5000,5000](${source})](https://example.com)`;
  const original = `Moved below this paragraph

${image}

${image}`;
  const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const focus = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
  function apply(args: { from: number; insert: string; to: number }, markdown: string) {
    return markdown.slice(0, args.from) + args.insert + markdown.slice(args.to);
  }
  const range = collectImageMatches(0, original)[1]!;
  const cropped = apply(createMarkdownImageCropEdit({ imageRange: range, markdown: original, crop })!, original);
  const matches = collectImageMatches(0, cropped);
  expect(matches[0]?.crop).toBeUndefined();
  expect(matches[1]).toMatchObject({ alt: 'Cover', linkHref: 'https://example.com', displayWidth: 268, focus, crop, source });
  const resized = setMarkdownImageDisplayWidth({ imageRange: matches[1]!, markdown: cropped, width: 320 })!;
  const resizedRange = collectImageMatches(0, resized)[1]!;
  expect(resizedRange).toMatchObject({ displayWidth: 320, crop, focus });
  const refocused = apply(createMarkdownImageFocusEdit({ imageRange: resizedRange, markdown: resized, focus: crop })!, resized);
  expect(collectImageMatches(0, refocused)[1]).toMatchObject({ displayWidth: 320, crop, focus: crop });
  const removed = apply(createMarkdownImageCropEdit({
    imageRange: collectImageMatches(0, refocused)[1]!, markdown: refocused, crop: null
  })!, refocused);
  expect(collectImageMatches(0, removed)[1]).toMatchObject({ displayWidth: 320, focus: crop, source });
  expect(collectImageMatches(0, removed)[1]?.crop).toBeUndefined();
});
