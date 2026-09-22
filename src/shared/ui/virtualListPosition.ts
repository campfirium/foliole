export interface VirtualListAnchor {
  key: string;
  index: number;
  offset: number;
  order: readonly string[];
}

export interface VirtualListPosition {
  read(): VirtualListAnchor | undefined;
  write(anchor: VirtualListAnchor): void;
}

export function resolveVirtualListAnchorIndex(anchor: VirtualListAnchor, keys: readonly string[]) {
  const indexes = new Map(keys.map((key, index) => [key, index]));
  const exact = indexes.get(anchor.key);
  if (exact !== undefined) return exact;
  for (let distance = 1; distance < anchor.order.length; distance += 1) {
    const next = indexes.get(anchor.order[anchor.index + distance] ?? '');
    if (next !== undefined) return next;
    const previous = indexes.get(anchor.order[anchor.index - distance] ?? '');
    if (previous !== undefined) return previous;
  }
  return Math.min(anchor.index, Math.max(0, keys.length - 1));
}
