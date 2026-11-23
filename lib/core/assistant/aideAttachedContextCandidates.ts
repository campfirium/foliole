import { parseExcerptAnnotationContent } from '../annotations/textAnnotationContent.js';

import type { AideContextCandidates, AideContextUnit } from './aideAttachedContextAllocation.js';
import {
  locateAideFocusRange,
  readAideAnchorOriginalText,
  readAideFrontmatterRange,
  resolveAideContextSource,
  type AideContextNode,
  type AideContextSourceChain
} from './aideAttachedContextSource.js';
import { buildAideOutlineUnits, buildAideSurroundingUnits } from './aideAttachedContextSourceText.js';

export interface AideContextSnapshot {
  // Parent first, up to the library root.
  ancestors: AideContextNode[];
  children: AideContextNode[];
  collections: { dives: string[]; indexes: string[] };
  focus: AideContextNode;
  selectionText?: string | undefined;
}

export function buildAideAttachedContextCandidates(snapshot: AideContextSnapshot): AideContextCandidates {
  const chain = resolveAideContextSource(snapshot.focus, snapshot.ancestors);
  if (!chain) return {};
  const range = locateAideFocusRange({ chain, focus: snapshot.focus, selectionText: snapshot.selectionText });
  return {
    annotations: buildAnnotationUnits(snapshot, chain),
    location: buildLocationUnits(snapshot, chain),
    metadata: buildMetadataUnits(chain.source),
    outline: buildAideOutlineUnits(chain.source, range?.from ?? null),
    selection: buildSelectionUnits(snapshot),
    surrounding: range ? buildAideSurroundingUnits(chain.source.content, range) : []
  };
}

function buildSelectionUnits(snapshot: AideContextSnapshot): AideContextUnit[] {
  const selection = snapshot.selectionText?.trim();
  if (selection) return [{ text: selection }];
  const focus = snapshot.focus;
  if (focus.kind === 'item') return buildItemUnits(focus, false);
  if (!focus.anchor) return [];
  const original = readAideAnchorOriginalText(focus.anchor);
  const parsed = parseExcerptAnnotationContent({ content: focus.content });
  const body = parsed.body.trim();
  return [
    ...(original ? [{ text: original }] : []),
    ...(body && !sameText(body, original) ? [{ label: 'Current text: ', text: body }] : []),
    ...(parsed.note ? [{ label: 'Note: ', text: parsed.note }] : [])
  ];
}

// Items are the reader's own cards: they are never deduplicated, so a short answer is never dropped.
function buildItemUnits(node: AideContextNode, related: boolean): AideContextUnit[] {
  const question = node.content.trim();
  const answer = node.reveal?.trim() ?? '';
  return [
    ...(question ? [{ label: related ? 'Item question: ' : 'Question: ', text: question }] : []),
    ...(answer ? [{ label: related ? 'Item answer: ' : 'Answer: ', text: answer }] : [])
  ];
}

function buildMetadataUnits(source: AideContextNode): AideContextUnit[] {
  const blocks: string[] = [];
  for (const line of readAideFrontmatterRange(source.content).yaml.split(/\r?\n/u)) {
    if (/^[^\s#-][^:]*:/u.test(line)) blocks.push(line.trimEnd());
    else if (line.trim() && blocks.length) blocks[blocks.length - 1] += `\n${line.trimEnd()}`;
  }
  const kept = blocks.filter((block) => !/^(tags|collections)\s*:/iu.test(block));
  if (!kept.some((block) => /^title\s*:/iu.test(block)) && source.title.trim()) {
    kept.unshift(`title: ${source.title.trim()}`);
  }
  return kept.map((text) => ({ atomic: true, text }));
}

function buildLocationUnits(snapshot: AideContextSnapshot, chain: AideContextSourceChain): AideContextUnit[] {
  const entries: Array<[string, string]> = [
    ['Folder: ', chain.folderPath.join(' / ')],
    ['Indexes: ', snapshot.collections.indexes.join(', ')],
    ['Dives: ', snapshot.collections.dives.join(', ')]
  ];
  return entries.flatMap(([label, text]) => (text ? [{ atomic: true, label, text }] : []));
}

function buildAnnotationUnits(snapshot: AideContextSnapshot, chain: AideContextSourceChain): AideContextUnit[] {
  return [
    ...snapshot.children.flatMap((child) => buildRelatedNodeUnits(child, 'Excerpt')),
    ...chain.anchoredAncestors.flatMap((node) => buildRelatedNodeUnits(node, 'Source excerpt'))
  ];
}

function buildRelatedNodeUnits(node: AideContextNode, label: string): AideContextUnit[] {
  if (node.kind === 'item') return buildItemUnits(node, true);
  if (!node.anchor) return [];
  const parsed = parseExcerptAnnotationContent({ content: node.content });
  const body = parsed.body.trim();
  const edited = body && !sameText(body, readAideAnchorOriginalText(node.anchor));
  return [
    ...(body ? [{ dedupe: true, label: `${label}${edited ? ' (edited)' : ''}: `, text: body }] : []),
    ...(parsed.note ? [{ label: 'Note: ', text: parsed.note }] : [])
  ];
}

function sameText(left: string, right: string) {
  const normalize = (value: string) => value.replace(/\s+/gu, ' ').trim();
  return normalize(left) === normalize(right);
}
