import { describe, expect, it } from 'vitest';

import { createClipboardExportPayload, FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';

describe('clipboardInterop', () => {
  it('keeps internal markdown and exports attachment paths for external paste', () => {
    const payload = createClipboardExportPayload(
      'Before ![Cover](asset://hash-1.png) after',
      null,
      '/Users/tester/Documents/Foliole/Assets'
    );

    expect(payload).toEqual({
      internalText: 'Before ![Cover](asset://hash-1.png) after',
      externalText: 'Before ![Cover](file:///Users/tester/Documents/Foliole/Assets/hash-1.png) after',
      externalHtml:
        '<p>Before <img alt="Cover" src="file:///Users/tester/Documents/Foliole/Assets/hash-1.png"> after</p>'
    });
  });

  it('converts anchor tags into external-readable content while preserving the internal payload', () => {
    const payload = createClipboardExportPayload(
      '<highlight id="1">Keep</highlight id="1"> and <cloze id="2">hide</cloze id="2">',
      null,
      null
    );

    expect(payload?.internalText).toBe('<highlight id="1">Keep</highlight id="1"> and <cloze id="2">hide</cloze id="2">');
    expect(payload?.externalText).toBe('==Keep== and hide');
    expect(payload?.externalHtml).toBe('<p><mark>Keep</mark> and hide</p>');
  });

  it('prefers the expanded markdown selection for external export only', () => {
    const payload = createClipboardExportPayload('[label](https://example.com)', '[label](https://example.com)', null);

    expect(payload?.internalText).toBe('[label](https://example.com)');
    expect(payload?.externalText).toBe('[label](https://example.com)');
  });

  it('uses the documented custom mime type for internal clipboard data', () => {
    expect(FOLIOLE_CLIPBOARD_MIME).toBe('application/x-foliole');
  });
});
