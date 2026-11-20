import { mapSplitTopicSourceRange, type SplitTopicSourceMap, type SplitTopicSourceRange } from '../nodes/splitTopicModel.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';
import type { DatabaseDriver } from './driver.js';
import { ensureNodesParentMembership } from './nodeOrderMutations.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

export interface SplitTopicAnchorTarget {
  nodeId: string;
  body: string;
  sourceMap: SplitTopicSourceMap;
}

interface AnchoredChildRow {
  id: string;
  anchor_link: string;
  [key: string]: unknown;
}

interface LocatorRange extends SplitTopicSourceRange {
  originalText?: string;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRange(value: unknown): value is LocatorRange & JsonObject {
  return isObject(value) && typeof value.from === 'number' && typeof value.to === 'number';
}

/** Text ranges of a highlight or cloze anchor; image and formula anchors carry no body ranges. */
function readLocatorRanges(locator: unknown): Array<LocatorRange & JsonObject> | null {
  if (!isObject(locator)) return null;
  if (Array.isArray(locator.ranges)) return locator.ranges.every(isRange) && locator.ranges.length ? locator.ranges : null;
  return isRange(locator) ? [locator] : null;
}

/** Same rule as the editor: trust stored offsets when they still match, else a unique occurrence of the text. */
function resolveSourceRange(content: string, range: LocatorRange): SplitTopicSourceRange | null {
  const originalText = typeof range.originalText === 'string' ? range.originalText : null;
  if (originalText === null) return range.from >= 0 && range.to <= content.length && range.from <= range.to ? range : null;
  if (content.slice(range.from, range.to) === originalText) return range;
  if (!originalText) return null;
  const first = content.indexOf(originalText);
  if (first < 0 || content.indexOf(originalText, first + 1) >= 0) return null;
  return { from: first, to: first + originalText.length };
}

function relocateAnchor(anchorLink: string, sourceContent: string, targets: readonly SplitTopicAnchorTarget[]) {
  const anchor = parseStoredAnchorLink(anchorLink);
  if (!anchor || anchor.kind === 'image-excerpt') return null;
  const parsed: unknown = JSON.parse(anchorLink);
  if (!isObject(parsed)) return null;
  const ranges = readLocatorRanges(parsed.locator);
  if (!ranges) return null;
  const resolved = ranges.map((range) => resolveSourceRange(sourceContent, range));
  if (resolved.some((range) => range === null)) return null;
  for (const target of targets) {
    const mapped = resolved.map((range) => mapSplitTopicSourceRange(target.sourceMap, range!));
    if (mapped.some((range) => range === null)) continue;
    const nextRanges = ranges.map((range, index) => {
      const { from, to } = mapped[index]!;
      return { ...range, from, to, ...('originalText' in range ? { originalText: target.body.slice(from, to) } : {}) };
    });
    const locator = parsed.locator as JsonObject;
    const nextLocator = Array.isArray(locator.ranges) ? { ...locator, ranges: nextRanges } : { ...locator, ...nextRanges[0] };
    return { anchorLink: JSON.stringify({ ...parsed, locator: nextLocator }), nodeId: target.nodeId, sourceFrom: resolved[0]!.from };
  }
  return null;
}

/**
 * Moves text-anchored children (highlights, clozes) of a replaced split source onto the generated part that now
 * holds their text. Anchors that cannot be placed stay with the source. Returns the moved node ids.
 */
export function migrateSplitTopicAnchors(driver: DatabaseDriver, input: {
  now: string;
  sourceContent: string;
  sourceNodeId: string;
  targets: readonly SplitTopicAnchorTarget[];
}) {
  const children = driver.queryAll<AnchoredChildRow>(
    'SELECT id, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL',
    [input.sourceNodeId]
  );
  const moves = children.flatMap((child) => {
    let relocated: ReturnType<typeof relocateAnchor>;
    try {
      relocated = relocateAnchor(child.anchor_link, input.sourceContent, input.targets);
    } catch {
      relocated = null;
    }
    return relocated ? [{ id: child.id, ...relocated }] : [];
  }).sort((left, right) => left.sourceFrom - right.sourceFrom);
  for (const move of moves) {
    driver.execute('UPDATE nodes SET parent_id = ?, anchor_link = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?',
      [move.nodeId, move.anchorLink, input.now, move.id]);
  }
  const movedIds = moves.map((move) => move.id);
  ensureNodesParentMembership(driver, movedIds);
  if (movedIds.length) enqueueWorkspaceSearchInvalidationForNodeIds(driver, movedIds);
  return movedIds;
}
