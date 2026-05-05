import { describe, expect, it } from 'vitest';

import {
  extractMarkedTextAnchorRanges,
  parseStructuredClipboardPayload,
  serializeStructuredClipboardPayload
} from './anchorClipboardPayload';

describe('anchorClipboardPayload', () => {
  it('serializes and parses structured clipboard payloads', () => {
    const encoded = serializeStructuredClipboardPayload({
      anchors: [{ from: 7, kind: 'highlight', to: 16 }],
      internalText: 'Before important after'
    });

    expect(parseStructuredClipboardPayload(encoded)).toEqual({
      anchors: [{ from: 7, kind: 'highlight', to: 16 }],
      internalText: 'Before important after',
      version: 1
    });
  });

  it('extracts plain text and anchor ranges from external highlight markers', () => {
    expect(extractMarkedTextAnchorRanges('Before ==important== and <u>hidden</u>')).toEqual({
      anchors: [
        { from: 7, kind: 'highlight', to: 16 },
        { from: 21, kind: 'cloze', to: 27 }
      ],
      text: 'Before important and hidden'
    });
  });

  it('supports nested cloze markers inside highlight markers', () => {
    expect(extractMarkedTextAnchorRanges('==Alpha <u>Beta</u>==')).toEqual({
      anchors: [
        { from: 6, kind: 'cloze', to: 10 },
        { from: 0, kind: 'highlight', to: 10 }
      ],
      text: 'Alpha Beta'
    });
  });
});
