import type { PreparedReadwiseApiEpubStructure } from '../../lib/core/readwise/readwiseApiEpubStructure.js';

import {
  coverageHash, describeCoverageDifference, normalizeCoverage, rootSourceContent
} from './readwise-epub-structure-repair-guards.js';
import type { RepairBody } from './readwise-epub-structure-repair-types.js';

interface ExistingBody {
  content: string;
  id: string;
  is_title_manual: number;
  parent_id: string | null;
  title: string;
}

interface DesiredBody {
  content: string;
  key: string;
  nodeId: string;
  parentKey: string | null;
  title: string;
}

export function buildRepairBodies(input: {
  contentById: ReadonlyMap<string, string[]>;
  desired: DesiredBody[];
  documentId: string;
  oldGenerated: ExistingBody[];
  root: ExistingBody;
  structure: PreparedReadwiseApiEpubStructure;
}) {
  const sourceContent = [
    input.structure.legacyRootBody ?? '',
    ...(input.structure.legacySections ?? []).map((section) => section.content)
  ].join('\n\n');
  const currentContent = [
    rootSourceContent(input.root.content, input.root.title), ...input.oldGenerated.map((row) => row.content)
  ].join('\n\n');
  const sourceCoverageHash = coverageHash(sourceContent);
  const currentCoverageHash = coverageHash(currentContent);
  const sourceChanged = currentCoverageHash !== sourceCoverageHash;
  const bodies: RepairBody[] = [
    {
      content: rebuildRootContent(
        input.root.content,
        sourceChanged
          ? input.structure.rootBody
          : rootSourceContent(input.root.content, input.root.title),
        sourceChanged ? undefined : input.contentById.get(input.root.id),
        input.root.title
      ),
      isTitleManual: input.root.is_title_manual,
      nodeId: input.root.id, parentId: input.root.parent_id, title: input.root.title
    },
    ...input.desired.map((node) => ({
      content: sourceChanged ? node.content : joinChunks(input.contentById.get(node.nodeId)),
      nodeId: node.nodeId,
      isTitleManual: input.oldGenerated.find((row) => row.id === node.nodeId)!.is_title_manual,
      parentId: node.parentKey
        ? input.desired.find((item) => item.key === node.parentKey)?.nodeId ?? input.root.id
        : input.root.id,
      title: node.title
    }))
  ];
  const newCoverageHash = coverageHash([
    rootSourceContent(bodies[0]!.content, input.root.title), ...bodies.slice(1).map((item) => item.content)
  ].join('\n\n'));
  assertCoverage(input, bodies, sourceCoverageHash, newCoverageHash);
  return { bodies, currentCoverageHash, newCoverageHash, sourceChanged, sourceCoverageHash };
}

function assertCoverage(
  input: Parameters<typeof buildRepairBodies>[0],
  bodies: RepairBody[],
  sourceCoverageHash: string,
  newCoverageHash: string
) {
  if (sourceCoverageHash !== newCoverageHash || bodies.length !== input.desired.length + 1) {
    const sourceContent = [
      input.structure.legacyRootBody ?? '',
      ...(input.structure.legacySections ?? []).map((section) => section.content)
    ].join('\n\n');
    const projectedContent = [
      rootSourceContent(bodies[0]!.content, input.root.title), ...bodies.slice(1).map((item) => item.content)
    ].join('\n\n');
    throw new Error([
      'readwise_epub_reprojected_body_coverage_mismatch', input.documentId,
      `source=${sourceCoverageHash}`, `projected=${newCoverageHash}`,
      `bodies=${bodies.length}`, `desired=${input.desired.length + 1}`,
      JSON.stringify(describeCoverageDifference(sourceContent, projectedContent))
    ].join(':'));
  }
}

function rebuildRootContent(
  current: string,
  sourceRoot: string,
  added: string[] | undefined,
  rootTitle: string
) {
  const blocks = current.trim().split(/\n{2,}/u);
  const trailingLinks = blocks.at(-1)?.includes('[Open in Reader]') ? blocks.pop() : null;
  const title = headingText(blocks[0]) === rootTitle ? blocks.shift() : null;
  const coverIndex = blocks.findIndex(isLocalizedCover);
  const cover = coverIndex >= 0 ? blocks.splice(coverIndex, 1)[0] : null;
  const localized = blocks.join('\n\n');
  const root = normalizeCoverage(localized) === normalizeCoverage(sourceRoot)
    ? localized : localizeRemoteImages(sourceRoot, localized);
  return [title, cover, root, joinChunks(added), trailingLinks].filter(Boolean).join('\n\n');
}

function localizeRemoteImages(content: string, localized: string) {
  const assets = (localized.match(/!\[[^\]]*\]\(asset:\/\/[^)]*\)/giu) ?? [])
    .filter((image) => !/!\[[^\]]* cover\]\(asset:\/\//iu.test(image));
  let index = 0;
  return content.replace(/!\[[^\]]*\]\(https?:\/\/[^)]*\)/giu, () => (
    assets[index++] ?? '**Image unavailable.**'
  ));
}

function headingText(value: string | undefined) {
  return value?.match(/^#{1,6}\s+(.+)$/u)?.[1]?.trim() ?? null;
}

function isLocalizedCover(value: string) {
  return /^!\[[^\]\r\n]* cover\]\(asset:\/\/[^)\r\n]+\)$/iu.test(value.trim());
}

function joinChunks(chunks: string[] | undefined) {
  return (chunks ?? []).map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');
}
