import type { Text } from '@codemirror/state';

import { extractDocumentOutline, type DocumentOutlineItem } from './documentOutline';

export interface EditorOutlineItem extends DocumentOutlineItem { id: string }
export interface EditorOutlineSnapshot {
  nodeId: string | null;
  items: readonly EditorOutlineItem[];
}
export interface EditorOutlineSource {
  getSnapshot(): EditorOutlineSnapshot;
  subscribe(listener: () => void): () => void;
}

let nextIdentity = 0;
type HeadingAnchor = { id: string; position: number };

export class EditorOutlineTracker implements EditorOutlineSource {
  private anchors: HeadingAnchor[] = [];
  private snapshot: EditorOutlineSnapshot | null = null;
  private listeners = new Set<() => void>();

  constructor(private doc: Text, private nodeId: string | null) {}

  getSnapshot = (): EditorOutlineSnapshot => {
    if (this.snapshot) return this.snapshot;
    const anchorsByLine = this.indexAnchors();
    const items = extractDocumentOutline(this.doc.toString()).map(item => {
      const lineFrom = this.doc.lineAt(item.from).from;
      const matches = (anchorsByLine.get(lineFrom) ?? []).filter(anchor => anchor.position <= item.from);
      return { ...item, id: matches.length === 1 ? matches[0]!.id : `heading-${++nextIdentity}` };
    });
    this.anchors = items.map(item => ({ id: item.id, position: this.doc.lineAt(item.from).from }));
    this.snapshot = { nodeId: this.nodeId, items };
    return this.snapshot;
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  update(doc: Text, mapPosition: (position: number) => number | null, nodeId: string | null, external: boolean) {
    if (doc === this.doc && nodeId === this.nodeId) return;
    this.anchors = external || nodeId !== this.nodeId ? [] : this.anchors.flatMap(anchor => {
      const position = mapPosition(anchor.position);
      return position === null ? [] : [{ id: anchor.id, position }];
    });
    this.doc = doc;
    this.nodeId = nodeId;
    this.snapshot = null;
    for (const listener of this.listeners) listener();
  }

  destroy() { this.listeners.clear(); }

  private indexAnchors() {
    const byLine = new Map<number, HeadingAnchor[]>();
    for (const anchor of this.anchors) {
      const line = this.doc.lineAt(anchor.position).from;
      const anchors = byLine.get(line) ?? [];
      anchors.push(anchor);
      byLine.set(line, anchors);
    }
    return byLine;
  }
}
