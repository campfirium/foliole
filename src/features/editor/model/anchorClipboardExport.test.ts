import { describe, expect, it } from 'vitest';

import { createClipboardExportPayload } from './anchorClipboardExport';

function parseAssetUrl(assetUrl: string) {
  const match = /^asset:\/\/([^./]+)(?:\..+)?$/.exec(assetUrl);
  return match?.[1] ?? null;
}

describe('anchorClipboardExport', () => {
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

  it('converts anchors into external-readable content while preserving the internal payload', () => {
    const payload = createClipboardExportPayload({
      assetsDir: null,
      externalTextBase: null,
      internalText: '<highlight id="1">Keep</highlight id="1"> and <cloze id="2">hide</cloze id="2">',
      parseAssetUrl
    });

    expect(payload?.internalText).toBe('<highlight id="1">Keep</highlight id="1"> and <cloze id="2">hide</cloze id="2">');
    expect(payload?.internalAnchors).toEqual([]);
    expect(payload?.externalText).toBe('==Keep== and <u>hide</u>');
    expect(payload?.externalHtml).toBe('<p><mark>Keep</mark> and <u>hide</u></p>');
  });

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
});
