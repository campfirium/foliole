import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { remapRawStoredAnchorLink } from '../../lib/core/database/storedAnchorLinkRemap.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { collectArticleImageStorageKeys } from '../../lib/core/import/replaceArticleImageSource.js';
import { convertSuperMemoContent } from '../../lib/core/import/superMemoContent.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import type { NativeSuperMemoTextChange } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { addSuperMemoCitation, removeSuperMemoCitation, type SuperMemoCitation } from './superMemoCitation.js';

type Field = 'content' | 'reveal';
export type MaterialDocument = { content: string; reveal: string | null };
export type ImportedText = Partial<Record<Field, string>>;

export function previewSuperMemoMarkdown(expectedImages: ReadonlyMap<string, string | null>) {
  const destinations = new Map([...expectedImages].flatMap(([source, key]) =>
    key ? [[source, buildAssetMarkdownUrl(key)] as const] : []));
  return (parts: string[]) => convertSuperMemoContent(parts, destinations).content;
}

type TextRange = { from: number; to: number; originalText: string };

function textRanges(value: string): TextRange[] {
  const locator = (JSON.parse(value) as { locator?: TextRange | { ranges: TextRange[] } }).locator;
  if (!locator) return [];
  return 'ranges' in locator ? locator.ranges : [locator];
}

function retainsSelections(driver: DatabaseDriver, nodeId: string, previousContent: string, nextContent: string) {
  const children = driver.queryAll<{ anchor_link: string; image_regions: string | null }>(
    'SELECT anchor_link, image_regions FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL AND deleted_at IS NULL', [nodeId]);
  return children.every(row => {
    try {
      const resolved = remapRawStoredAnchorLink({ value: row.anchor_link, imageRegions: row.image_regions, previousContent, nextContent });
      if (!('value' in resolved) || resolved.imageRegions !== row.image_regions) return false;
      const old = textRanges(row.anchor_link);
      const next = textRanges(resolved.value);
      return old.length > 0 && old.length === next.length && old.every(({ from, to, originalText }, index) => {
        const mapped = next[index];
        return originalText && mapped && previousContent.slice(from, to) === originalText &&
          mapped.originalText === originalText && nextContent.slice(mapped.from, mapped.to) === originalText &&
          (mapped.from === from || nextContent.indexOf(originalText) === nextContent.lastIndexOf(originalText));
      });
    } catch {
      return false;
    }
  });
}

function sameManagedImages(current: string, proposed: string) {
  const previous = collectArticleImageStorageKeys(current).sort();
  const next = collectArticleImageStorageKeys(proposed).sort();
  return previous.length === next.length && previous.every((key, index) => key === next[index]);
}

export function planSuperMemoTextFields(input: {
  driver: DatabaseDriver; nodeId: string; sourceId: number; title: string; isItem: boolean;
  previous: MaterialDocument; next: MaterialDocument; original: SuperMemoCitation | null; nextCitation: SuperMemoCitation | null;
  baseline: ImportedText | undefined; pristine: boolean; receiptKnown: boolean; hasIncomingAnchor: boolean;
  source: Partial<Record<Field, string>>;
}) {
  const fields: Field[] = input.isItem ? ['content', 'reveal'] : ['content'];
  const hashes: ImportedText = {};
  const changes: NativeSuperMemoTextChange[] = [];
  for (const field of fields) {
    const proposed = input.source[field];
    if (proposed === undefined) continue;
    const value = input.previous[field] ?? '';
    const plain = input.original?.field === field ? removeSuperMemoCitation(value, input.original) : value;
    if (plain === proposed) continue;
    const fieldName = field === 'reveal' ? 'answer' : input.isItem ? 'question' : 'body';
    const change = { sourceId: input.sourceId, title: input.title, field: fieldName } as const;
    const originalHash = input.baseline?.[field];
    const proposedHash = hashTextBody(proposed);
    if (originalHash === proposedHash) continue;
    const unchanged = plain !== null && (originalHash ? hashTextBody(plain) === originalHash : input.pristine && input.receiptKnown);
    const combined = addSuperMemoCitation(proposed, input.nextCitation, field);
    const reason = !unchanged || (input.nextCitation?.field === field && !proposed) ? 'edited' :
      !sameManagedImages(plain, proposed) ? 'media' :
      field === 'content' && (input.hasIncomingAnchor || !retainsSelections(input.driver, input.nodeId, value, combined)) ? 'anchor' : null;
    if (reason) {
      changes.push({ ...change, status: 'protected', reason });
    } else {
      changes.push({ ...change, status: 'update' });
      input.next[field] = combined;
      hashes[field] = proposedHash;
    }
  }
  return { changes, hashes };
}
