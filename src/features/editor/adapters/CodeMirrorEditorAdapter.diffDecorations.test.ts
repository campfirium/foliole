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
});
