import { describe, expect, it } from 'vitest';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

describe('CodeMirrorEditorAdapter diff decorations', () => {
  it('accepts line and spacer decorations together without throwing', () => {
    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'title\nsame\nleft only\nend'
    });

    expect(() =>
      adapter.setDiffDecorations({
        lineDecorations: [{ kind: 'removed', lineNumber: 3 }],
        spacerDecorations: [{ beforeLineNumber: 4, kind: 'added', lines: [{ className: null, lineNumber: 3, text: 'right only' }] }]
      })
    ).not.toThrow();

    adapter.destroy();
    host.remove();
  });

  it('keeps rounded corners only on the outer edges of contiguous diff lines', () => {
    const host = document.createElement('div');
    document.body.append(host);

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'title\nfirst changed\nsecond changed\nend'
    });

    adapter.setDiffDecorations({
      lineDecorations: [
        { kind: 'added', lineNumber: 2 },
        { kind: 'added', lineNumber: 3 }
      ],
      spacerDecorations: []
    });

    const diffLines = host.querySelectorAll('.cm-line.cm-diff-line-added');
    expect(diffLines[0]?.classList.contains('cm-diff-line-first')).toBe(true);
    expect(diffLines[0]?.classList.contains('cm-diff-line-last')).toBe(false);
    expect(diffLines[1]?.classList.contains('cm-diff-line-first')).toBe(false);
    expect(diffLines[1]?.classList.contains('cm-diff-line-last')).toBe(true);

    adapter.destroy();
    host.remove();
  });
});
