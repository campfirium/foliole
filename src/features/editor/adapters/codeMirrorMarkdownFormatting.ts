import { EditorSelection, type SelectionRange } from '@codemirror/state';
import type { Command, KeyBinding } from '@codemirror/view';

function preserveDirection(range: SelectionRange, from: number, to: number) {
  return range.anchor <= range.head
    ? EditorSelection.range(from, to)
    : EditorSelection.range(to, from);
}

function isStandaloneAsterisk(content: string, from: number, to: number) {
  return content[from - 1] !== '*' && content[to] !== '*';
}

function hasExactMarker(content: string, from: number, to: number, marker: string) {
  if (content.slice(from, to) !== marker) return false;
  return marker !== '*' || isStandaloneAsterisk(content, from, to);
}

function createFormattingChange(content: string, range: SelectionRange, marker: string) {
  const markerLength = marker.length;
  const selected = content.slice(range.from, range.to);
  const leftFrom = range.from - markerLength;
  const rightTo = range.to + markerLength;

  if (
    leftFrom >= 0
    && hasExactMarker(content, leftFrom, range.from, marker)
    && hasExactMarker(content, range.to, rightTo, marker)
  ) {
    return {
      changes: { from: leftFrom, to: rightTo, insert: selected },
      range: preserveDirection(range, leftFrom, range.to - markerLength)
    };
  }

  const includesMarkers = range.to - range.from >= markerLength * 2
    && hasExactMarker(content, range.from, range.from + markerLength, marker)
    && hasExactMarker(content, range.to - markerLength, range.to, marker);
  if (includesMarkers) {
    return {
      changes: { from: range.from, to: range.to, insert: selected.slice(markerLength, -markerLength) },
      range: preserveDirection(range, range.from, range.to - markerLength * 2)
    };
  }

  return {
    changes: { from: range.from, to: range.to, insert: `${marker}${selected}${marker}` },
    range: preserveDirection(range, range.from + markerLength, range.to + markerLength)
  };
}

function toggleMarkdownInlineFormat(marker: string): Command {
  return (view) => {
    if (view.state.readOnly) return false;
    const content = view.state.doc.toString();
    view.dispatch(view.state.changeByRange((range) => createFormattingChange(content, range, marker)));
    return true;
  };
}

export const markdownFormattingKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: toggleMarkdownInlineFormat('**') },
  { key: 'Mod-i', run: toggleMarkdownInlineFormat('*') }
];
