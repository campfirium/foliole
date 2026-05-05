import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { buildParagraphMarkerDecorations } from './paragraphMarkerDecorations';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = '';
});

describe('buildParagraphMarkerDecorations', () => {
  it('marks every line inside the selected paragraph range', () => {
    const host = document.createElement('div');
    document.body.append(host);

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: 'Alpha\nBeta\n\nGamma'
      })
    });

    const decorations = buildParagraphMarkerDecorations(view, { from: 0, to: 10 });
    const ranges: Array<{ from: number; className: string | null }> = [];

    decorations.between(0, view.state.doc.length, (from, _to, value) => {
      ranges.push({ className: value.spec.attributes?.class ?? null, from });
    });

    expect(ranges).toEqual([
      { className: 'cm-paragraph-marker-line', from: 0 },
      { className: 'cm-paragraph-marker-line', from: 6 }
    ]);
  });

  it('marks standalone image lines with the dedicated image marker class', () => {
    const host = document.createElement('div');
    document.body.append(host);

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: '![Cover](asset://hash-1.png)\n\nGamma'
      })
    });

    const decorations = buildParagraphMarkerDecorations(view, { from: 0, to: 28 });
    const ranges: Array<{ from: number; className: string | null }> = [];

    decorations.between(0, view.state.doc.length, (from, _to, value) => {
      ranges.push({ className: value.spec.attributes?.class ?? null, from });
    });

    expect(ranges).toEqual([
      { className: 'cm-paragraph-marker-line cm-paragraph-marker-line-image', from: 0 }
    ]);
  });

  it('uses parser-backed image matching for image lines with titles', () => {
    const host = document.createElement('div');
    document.body.append(host);

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: '![Cover](https://example.com/cover.png "Title")\n\nGamma'
      })
    });

    const decorations = buildParagraphMarkerDecorations(view, { from: 0, to: 47 });
    const ranges: Array<{ from: number; className: string | null }> = [];

    decorations.between(0, view.state.doc.length, (from, _to, value) => {
      ranges.push({ className: value.spec.attributes?.class ?? null, from });
    });

    expect(ranges).toEqual([
      { className: 'cm-paragraph-marker-line cm-paragraph-marker-line-image', from: 0 }
    ]);
  });
});
