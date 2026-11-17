import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5';

export type SuperMemoMarkKind = 'highlight' | 'cloze';
type Range = { from: number; to: number };
export type SuperMemoNativeMarks = Partial<Record<SuperMemoMarkKind, Range[]>>;

const marker = { highlight: ['\uE000', '\uE001'], cloze: ['\uE002', '\uE003'] } as const;
const markerPattern = /[\uE000-\uE003]/gu;
type MarkedKind = SuperMemoMarkKind | undefined;

function markKind(element: DefaultTreeAdapterTypes.Element): MarkedKind {
  const classes = element.attrs.find(attribute => attribute.name === 'class')?.value.toLowerCase().split(/\s+/u);
  if (classes?.includes('clozed')) return 'cloze';
  const style = element.attrs.find(attribute => attribute.name === 'style')?.value;
  if (classes?.includes('extract') || (style && /(?:^|;)\s*background-color\s*:\s*#7be1e1\s*(?:;|$)/iu.test(style))) return 'highlight';
  return undefined;
}

function labelText(parent: DefaultTreeAdapterTypes.ParentNode, inherited?: MarkedKind) {
  let found = false;
  for (const node of parent.childNodes) {
    if ('tagName' in node) {
      if (['style', 'script', 'supermemoreference'].includes(node.tagName)) continue;
      if (labelText(node, markKind(node) ?? inherited)) found = true;
    } else if (inherited && 'value' in node && node.value.trim()) {
      const [start, end] = marker[inherited];
      node.value = node.value.replace(/\S(?:[\s\S]*\S)?/u, text => start + text + end);
      found = true;
    }
  }
  return found;
}

function readRenderedMarks(marked: string, body: string): SuperMemoNativeMarks | undefined {
  if (marked.replace(markerPattern, '') !== body) return undefined;
  const ranges: SuperMemoNativeMarks = {};
  const open: Partial<Record<SuperMemoMarkKind, number>> = {};
  let removed = 0;
  for (const hit of marked.matchAll(markerPattern)) {
    const position = hit.index - removed++;
    const kind = hit[0] === marker.highlight[0] || hit[0] === marker.highlight[1] ? 'highlight' : 'cloze';
    if (hit[0] === marker[kind][0]) {
      if (open[kind] !== undefined) return undefined;
      open[kind] = position;
    } else {
      const from = open[kind];
      if (from === undefined) return undefined;
      if (position > from) (ranges[kind] ??= []).push({ from, to: position });
      delete open[kind];
    }
  }
  return Object.keys(open).length ? undefined : ranges;
}

export function readSuperMemoNativeMarks(parts: string[], body: string, render: (parts: string[]) => string) {
  if (parts.some(part => /[\uE000-\uE003]/u.test(part))) return undefined;
  let found = false;
  const marked = parts.map(part => {
    const fragment = parseFragment(part);
    if (!labelText(fragment)) return part;
    found = true;
    return serialize(fragment);
  });
  return found ? readRenderedMarks(render(marked), body) : undefined;
}
