import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { AnchoredImportedHighlightRecord } from '../../lib/core/database/importHighlightAnchors.js';
import { readExistingChildHighlights } from '../../lib/core/database/importPipelineHighlightNodes.js';

export function normalizeBookHighlightText(value: string) {
  return value.replace(/\r\n?/g, '\n').trim();
}

function highlightKeys(highlight: AnchoredImportedHighlightRecord) {
  return new Set([highlight.content, highlight.locatorText ?? ''].map(normalizeBookHighlightText).filter(Boolean));
}

function add<T>(index: Map<string, Set<T>>, key: string, value: T) {
  const entries = index.get(key) ?? new Set<T>();
  entries.add(value);
  index.set(key, entries);
}

/** Recover the identity of a detached source excerpt only for a one-to-one match. */
export function bindPreservedReadwiseBookHighlights(input: {
  driver: DatabaseDriver;
  unlocatedId: string;
  bySection: Map<string, AnchoredImportedHighlightRecord[]>;
}) {
  const retainedByText = new Map<string, Set<string>>();
  for (const row of readExistingChildHighlights(input.driver, input.unlocatedId)) {
    if (!row.anchor_link) continue;
    let anchor: { id?: string; kind?: string; readwiseBookSourceText?: string };
    try { anchor = JSON.parse(row.anchor_link); } catch { continue; }
    if (anchor?.kind !== 'highlight' || typeof anchor.id !== 'string' || !anchor.id.startsWith('imported-highlight-')) continue;
    const sourceText = typeof anchor.readwiseBookSourceText === 'string' ? anchor.readwiseBookSourceText : row.content;
    const key = normalizeBookHighlightText(sourceText);
    if (key) add(retainedByText, key, row.id);
  }
  const matches = new Map<AnchoredImportedHighlightRecord, Set<string>>();
  const incomingById = new Map<string, Set<AnchoredImportedHighlightRecord>>();
  for (const [sectionId, highlights] of input.bySection) {
    if (!highlights.length) continue;
    const directText = new Set(readExistingChildHighlights(input.driver, sectionId)
      .flatMap(row => {
        const anchor = parseStoredAnchorLink(row.anchor_link);
        if (!anchor?.id.startsWith('imported-highlight-')) return [];
        const locator = anchor.locator;
        return [normalizeBookHighlightText(locator && 'originalText' in locator ? locator.originalText ?? row.content : row.content)];
      }));
    for (const highlight of highlights) {
      const keys = highlightKeys(highlight);
      const retainedIds = new Set([...keys].flatMap(key => [...(retainedByText.get(key) ?? [])]));
      for (const id of retainedIds) add(incomingById, id, highlight);
      if (![...keys].some(key => directText.has(key))) matches.set(highlight, retainedIds);
    }
  }
  for (const [highlight, ids] of matches) {
    if (ids.size !== 1) continue;
    const id = ids.values().next().value!;
    if (incomingById.get(id)?.size === 1) highlight.nodeId = id;
  }
}
