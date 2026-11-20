import { collectMarkdownImageReferences } from '../../../../lib/core/import/markdownImageReferences';
import { parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';

import type { FlowCard } from './androidFlowTimingReport';

/** Card facts kept in memory only; storage keys never leave the device in the report. */
export type CardFacts = { images: number; storageKeys: string[]; bodyChars: number };
export type PendingCard = CardFacts & { operation: number; role: FlowCard['role'] };

export function readCardFacts(content: string): CardFacts {
  const references = collectMarkdownImageReferences(content);
  const storageKeys = references.flatMap(reference => {
    const target = reference.rawTarget.trim().split(/\s+/u)[0] ?? '';
    const key = parseAssetMarkdownUrl(target.startsWith('<') && target.endsWith('>') ? target.slice(1, -1) : target);
    return key ? [key] : [];
  });
  return { images: references.length, storageKeys, bodyChars: content.length };
}

export function resolveCards(cards: readonly PendingCard[], sizes: ReadonlyMap<string, number> | undefined): FlowCard[] {
  return cards.map(({ operation, role, images, storageKeys, bodyChars }) => {
    const sized = sizes ? storageKeys.flatMap(key => sizes.has(key) ? [sizes.get(key)!] : []) : [];
    return { operation, role, images, imageBytes: sized.reduce((sum, size) => sum + size, 0),
      unsizedImages: images - sized.length, bodyChars };
  });
}
