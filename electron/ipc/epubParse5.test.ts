import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { describe, expect, it } from 'vitest';

import { isHtmlElement } from './epubParse5.js';

function fragmentNodes(html: string) {
  return parseFragment(html).childNodes as DefaultTreeAdapterTypes.ChildNode[];
}

describe('isHtmlElement', () => {
  it('accepts parse5 element nodes', () => {
    const [element] = fragmentNodes('<section>Body</section>');

    expect(element).toBeDefined();
    expect(isHtmlElement(element!)).toBe(true);
  });

  it('rejects parse5 text nodes', () => {
    const [textNode] = fragmentNodes('Body');

    expect(textNode).toBeDefined();
    expect(isHtmlElement(textNode!)).toBe(false);
  });

  it('rejects parse5 comment nodes', () => {
    const [commentNode] = fragmentNodes('<!-- note -->');

    expect(commentNode).toBeDefined();
    expect(isHtmlElement(commentNode!)).toBe(false);
  });
});
