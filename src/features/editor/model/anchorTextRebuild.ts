import { serializeAnchorTag, type AnchorKind } from './anchorBlocks';

export interface AnchorVisibleRange {
  closeOrder: number;
  end: number;
  id: string;
  kind: AnchorKind;
  openOrder: number;
  start: number;
}

export function rebuildAnchoredText(visibleText: string, anchors: AnchorVisibleRange[]) {
  const openings = new Map<number, AnchorVisibleRange[]>();
  const closings = new Map<number, AnchorVisibleRange[]>();
  const emptyAnchors = new Map<number, AnchorVisibleRange[]>();

  for (const anchor of anchors) {
    if (anchor.start === anchor.end) {
      const items = emptyAnchors.get(anchor.start) ?? [];
      items.push(anchor);
      emptyAnchors.set(anchor.start, items);
      continue;
    }
    const starts = openings.get(anchor.start) ?? [];
    starts.push(anchor);
    openings.set(anchor.start, starts);
    const ends = closings.get(anchor.end) ?? [];
    ends.push(anchor);
    closings.set(anchor.end, ends);
  }

  const buffer: string[] = [];
  for (let position = 0; position <= visibleText.length; position += 1) {
    const ending = closings.get(position);
    if (ending) {
      ending.sort((left, right) => left.closeOrder - right.closeOrder);
      for (const anchor of ending) buffer.push(serializeAnchorTag({ id: anchor.id, kind: anchor.kind }, true));
    }

    const starting = openings.get(position);
    if (starting) {
      starting.sort((left, right) => left.openOrder - right.openOrder);
      for (const anchor of starting) buffer.push(serializeAnchorTag({ id: anchor.id, kind: anchor.kind }, false));
    }

    const empty = emptyAnchors.get(position);
    if (empty) {
      empty.sort((left, right) => left.openOrder - right.openOrder);
      for (const anchor of empty) {
        buffer.push(serializeAnchorTag({ id: anchor.id, kind: anchor.kind }, false));
        buffer.push(serializeAnchorTag({ id: anchor.id, kind: anchor.kind }, true));
      }
    }

    if (position < visibleText.length) {
      buffer.push(visibleText[position]);
    }
  }

  return buffer.join('');
}
