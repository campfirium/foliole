import { describe, expect, it } from 'vitest';

import { createClipboardExportPayload } from './anchorClipboardExport';

function parseAssetUrl(assetUrl: string) {
  const match = /^asset:\/\/([^./]+)(?:\..+)?$/.exec(assetUrl);
  return match?.[1] ?? null;
}

describe('anchorClipboardExport image HTML', () => {
  it('keeps internal markdown and exports attachment paths for external paste', () => {
    const payload = createClipboardExportPayload({
      assetsDir: '/Users/tester/Documents/Foliole/Assets',
      externalTextBase: null,
      internalText: 'Before ![Cover](asset://hash-1.png) after',
      parseAssetUrl
    });

    expect(payload).toEqual({
      internalAnchors: [],
      internalText: 'Before ![Cover](asset://hash-1.png) after',
      externalText: 'Before ![Cover](file:///Users/tester/Documents/Foliole/Assets/hash-1.png) after',
      externalHtml:
        '<p>Before <img alt="Cover" src="file:///Users/tester/Documents/Foliole/Assets/hash-1.png"> after</p>'
    });
  });

  it('exports parser-backed asset image targets while preserving titles', () => {
    const payload = createClipboardExportPayload({
      assetsDir: '/Users/tester/Documents/Foliole/Assets',
      externalTextBase: '![Cover](<asset://hash-1.png> "Title")',
      internalText: '![Cover](<asset://hash-1.png> "Title")',
      parseAssetUrl
    });

    expect(payload?.externalText).toBe(
      '![Cover](file:///Users/tester/Documents/Foliole/Assets/hash-1.png "Title")'
    );
    expect(payload?.externalHtml).toBe(
      '<img alt="Cover" src="file:///Users/tester/Documents/Foliole/Assets/hash-1.png">'
    );
  });

  it('renders parser-backed image targets with titles and nested parentheses for external HTML', () => {
    const payload = createClipboardExportPayload({
      assetsDir: null,
      externalTextBase: '![Cover](<https://example.com/gallery/(cover).png> "Title")',
      internalText: '![Cover](<https://example.com/gallery/(cover).png> "Title")',
      parseAssetUrl
    });

    expect(payload?.externalHtml).toBe(
      '<img alt="Cover" src="https://example.com/gallery/(cover).png">'
    );
  });

});

describe('anchorClipboardExport anchor payload', () => {
  it('prefers the expanded markdown selection for external export only', () => {
    const payload = createClipboardExportPayload({
      assetsDir: null,
      externalTextBase: '[label](https://example.com)',
      internalText: '[label](https://example.com)',
      parseAssetUrl
    });

    expect(payload?.internalText).toBe('[label](https://example.com)');
    expect(payload?.externalText).toBe('[label](https://example.com)');
  });

  it('exports locator-backed external text without polluting the internal payload', () => {
    const payload = createClipboardExportPayload({
      assetsDir: null,
      externalTextBase: 'Before ==important== and <u>hidden</u>',
      internalText: 'Before important and hidden',
      parseAssetUrl
    });

    expect(payload?.internalText).toBe('Before important and hidden');
    expect(payload?.internalAnchors).toEqual([]);
    expect(payload?.externalText).toBe('Before ==important== and <u>hidden</u>');
    expect(payload?.externalHtml).toBe('<p>Before <mark>important</mark> and <u>hidden</u></p>');
  });

  it('keeps explicit internal anchors when the caller already provides normalized content', () => {
    const payload = createClipboardExportPayload({
      assetsDir: null,
      externalTextBase: 'Before ==important== after',
      internalAnchors: [{ from: 7, kind: 'highlight', to: 16 }],
      internalText: 'Before important after',
      parseAssetUrl
    });

    expect(payload?.internalText).toBe('Before important after');
    expect(payload?.internalAnchors).toEqual([{ from: 7, kind: 'highlight', to: 16 }]);
    expect(payload?.externalText).toBe('Before ==important== after');
  });
});
