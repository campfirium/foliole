import type { TextAnchorLocator } from '../../lib/core/anchors/textAnchorLocator.js';
import { TextOccurrences } from '../../lib/core/anchors/textOccurrences.js';
import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadWorkspaceNodeDocument } from '../../lib/core/database/workspaceNodeDocument.js';
import { normalizeFullTextWithMap } from '../../lib/core/import/contextExcerptFullTextNormalize.js';
import { prepareSuperMemoParentText, superMemoParentTextRange } from '../../lib/core/import/superMemoParentText.js';

export interface ReparentedSuperMemoAnchor {
  link: { id: string; kind: 'highlight' | 'cloze'; locator: TextAnchorLocator };
  sourceVersionId: string | null;
}

function findUniqueAnchorText(source: ReturnType<typeof prepareSuperMemoParentText>, text: string): TextAnchorLocator | null {
  const quote = normalizeFullTextWithMap(text).normalized.trim();
  if (!quote) return null;
  const matches = new TextOccurrences(quote);
  matches.push(source.normalized);
  if (matches.count !== 1 || matches.first === null) return null;
  const from = matches.first;
  const end = from + quote.length;
  const joinsWord = (offset: number) => /[\p{Script=Latin}\p{N}]/u.test(source.normalized[offset - 1] ?? '') &&
    /[\p{Script=Latin}\p{N}]/u.test(source.normalized[offset] ?? '');
  if (joinsWord(from) || joinsWord(end)) return null;
  const found = superMemoParentTextRange(source, from, end);
  return found?.originalText === text ? found : null;
}

function readSimpleAnchor(raw: string) {
  try {
    return parseStoredAnchorLink(raw);
  } catch {
    return null;
  }
}

export function createSuperMemoAnchorReparentPlanner(driver: DatabaseDriver) {
  const documents = new Map<string, ReturnType<typeof loadWorkspaceNodeDocument>>();
  const parentTexts = new Map<string, ReturnType<typeof prepareSuperMemoParentText>>();
  function load(id: string) {
    if (!documents.has(id)) documents.set(id, loadWorkspaceNodeDocument(driver, id));
    return documents.get(id);
  }
  return (rawAnchor: string, previousParent: string, nextParent: string): ReparentedSuperMemoAnchor | null => {
    const link = readSimpleAnchor(rawAnchor);
    if (!link?.locator || link.kind === 'image-excerpt') return null;
    const { locator } = link;
    if (!('from' in locator) || typeof locator.from !== 'number' ||
        typeof locator.to !== 'number' || typeof locator.originalText !== 'string' || !locator.originalText.trim()) return null;
    const before = load(previousParent);
    const after = load(nextParent);
    if (before?.kind !== 'topic' || after?.kind !== 'topic' ||
        before.content.slice(locator.from, locator.to) !== locator.originalText) return null;
    let parentText = parentTexts.get(nextParent);
    if (!parentText) {
      parentText = prepareSuperMemoParentText(after.content);
      parentTexts.set(nextParent, parentText);
    }
    const nextLocator = findUniqueAnchorText(parentText, locator.originalText);
    if (!nextLocator) return null;
    const clean = driver.queryOne('SELECT id FROM nodes WHERE id = ? AND sync_dirty = 0', [nextParent]);
    return { link: { id: link.id, kind: link.kind, locator: nextLocator },
      sourceVersionId: clean ? after.currentVersionId : null };
  };
}
