export interface ClipboardAnchorRange {
  from: number;
  kind: 'highlight' | 'cloze';
  to: number;
}

export interface StructuredClipboardPayload {
  anchors: ClipboardAnchorRange[];
  internalText: string;
  version: 1;
}

const STRUCTURED_CLIPBOARD_VERSION = 1;

function isClipboardAnchorRange(value: unknown): value is ClipboardAnchorRange {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ClipboardAnchorRange>;
  return (
    (candidate.kind === 'highlight' || candidate.kind === 'cloze') &&
    Number.isInteger(candidate.from) &&
    Number.isInteger(candidate.to) &&
    typeof candidate.from === 'number' &&
    typeof candidate.to === 'number' &&
    candidate.from >= 0 &&
    candidate.to >= candidate.from
  );
}

export function serializeStructuredClipboardPayload(payload: {
  anchors: ReadonlyArray<ClipboardAnchorRange>;
  internalText: string;
}) {
  return JSON.stringify({
    anchors: [...payload.anchors],
    internalText: payload.internalText,
    version: STRUCTURED_CLIPBOARD_VERSION
  } satisfies StructuredClipboardPayload);
}

export function parseStructuredClipboardPayload(value: string): StructuredClipboardPayload | null {
  if (!value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Partial<StructuredClipboardPayload>;
    if (parsed.version !== STRUCTURED_CLIPBOARD_VERSION || typeof parsed.internalText !== 'string') {
      return null;
    }
    const anchors = Array.isArray(parsed.anchors) ? parsed.anchors.filter(isClipboardAnchorRange) : [];
    return {
      anchors,
      internalText: parsed.internalText,
      version: STRUCTURED_CLIPBOARD_VERSION
    };
  } catch {
    return null;
  }
}

export function extractMarkedTextAnchorRanges(value: string): { anchors: ClipboardAnchorRange[]; text: string } | null {
  if (!value.includes('==') && !value.includes('<u>')) {
    return null;
  }

  const anchors: ClipboardAnchorRange[] = [];
  const stack: Array<{ kind: 'highlight' | 'cloze'; start: number }> = [];
  let text = '';

  for (let index = 0; index < value.length; ) {
    if (value.startsWith('==', index)) {
      const top = stack.at(-1);
      if (top?.kind === 'highlight') {
        stack.pop();
        if (top.start < text.length) {
          anchors.push({ from: top.start, kind: 'highlight', to: text.length });
        }
      } else {
        stack.push({ kind: 'highlight', start: text.length });
      }
      index += 2;
      continue;
    }

    if (value.startsWith('<u>', index)) {
      stack.push({ kind: 'cloze', start: text.length });
      index += 3;
      continue;
    }

    if (value.startsWith('</u>', index)) {
      const top = stack.at(-1);
      if (!top || top.kind !== 'cloze') {
        return null;
      }
      stack.pop();
      if (top.start < text.length) {
        anchors.push({ from: top.start, kind: 'cloze', to: text.length });
      }
      index += 4;
      continue;
    }

    text += value[index] ?? '';
    index += 1;
  }

  if (stack.length > 0) {
    return null;
  }

  return anchors.length > 0 ? { anchors, text } : null;
}
