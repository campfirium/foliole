export const DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX = '※ ';

function findAnnotationMarker(content: string, notePrefix: string) {
  return ['\r\n', '\n', '\r']
    .map((lineEnding) => ({ lineEnding, index: content.indexOf(`${lineEnding}${notePrefix}`) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index)[0] ?? null;
}

export function parseExcerptAnnotationContent(input: {
  content: string;
  notePrefix?: string;
}) {
  const notePrefix = input.notePrefix ?? DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX;
  const marker = findAnnotationMarker(input.content, notePrefix);
  if (!marker) {
    return { body: input.content, lineEnding: null, note: null };
  }
  return {
    body: input.content.slice(0, marker.index),
    lineEnding: marker.lineEnding,
    note: input.content.slice(marker.index + marker.lineEnding.length + notePrefix.length).trim() || null
  };
}

export function replaceExcerptAnnotation(input: {
  content: string;
  note: string;
  notePrefix?: string;
}) {
  const note = input.note.replace(/\r\n?/g, '\n').trim();
  if (!note) {
    return input.content;
  }
  const notePrefix = input.notePrefix ?? DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX;
  const parsed = parseExcerptAnnotationContent({ content: input.content, notePrefix });
  const lineEnding = parsed.lineEnding ?? (input.content.includes('\r\n') ? '\r\n' : '\n');
  return `${parsed.body}${lineEnding}${notePrefix}${note}`;
}

export function parseHighlightCardContent(input: {
  content: string;
  notePrefix?: string;
}) {
  const content = input.content.replace(/\r\n?/g, '\n').trim();
  const marker = `\n${input.notePrefix ?? DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}`;
  const markerIndex = content.indexOf(marker);
  if (markerIndex < 0) {
    return { note: null, text: content };
  }
  return {
    note: content.slice(markerIndex + marker.length).trim() || null,
    text: content.slice(0, markerIndex).trim()
  };
}

export function formatHighlightCardContent(input: {
  note?: string | null;
  notePrefix?: string;
  text: string;
}) {
  const text = input.text.replace(/\r\n?/g, '\n').trim();
  const note = input.note?.replace(/\r\n?/g, '\n').trim() ?? '';
  return note ? `${text}\n${input.notePrefix ?? DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}${note}` : text;
}

export function appendHighlightCardNote(input: {
  content: string;
  note: string;
  notePrefix?: string;
  originalText: string;
}) {
  return formatHighlightCardContent({
    note: input.note,
    ...(input.notePrefix === undefined ? {} : { notePrefix: input.notePrefix }),
    text: input.originalText || input.content
  });
}
