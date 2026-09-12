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
  rootBody: string;
  structure: PreparedReadwiseApiEpubStructure;
}) {
  const bodies: RepairBody[] = [
    {
      content: rebuildRootContent(
        input.root.content, input.rootBody, input.contentById.get(input.root.id)
      ),
      isTitleManual: input.root.is_title_manual,
      nodeId: input.root.id, parentId: input.root.parent_id, title: input.root.title
    },
    ...input.desired.map((node) => ({
      content: joinChunks(input.contentById.get(node.nodeId)), nodeId: node.nodeId,
      isTitleManual: input.oldGenerated.find((row) => row.id === node.nodeId)!.is_title_manual,
      parentId: node.parentKey
        ? input.desired.find((item) => item.key === node.parentKey)?.nodeId ?? input.root.id
        : input.root.id,
      title: node.title
    }))
  ];
  const sourceCoverageHash = coverageHash([
    input.structure.legacyRootBody ?? '',
    ...(input.structure.legacySections ?? []).map((section) => section.content)
  ].join('\n\n'));
  const currentCoverageHash = coverageHash([
    rootSourceContent(input.root.content), ...input.oldGenerated.map((row) => row.content)
  ].join('\n\n'));
  const newCoverageHash = coverageHash([
    rootSourceContent(bodies[0]!.content), ...bodies.slice(1).map((item) => item.content)
  ].join('\n\n'));
  assertCoverage(input, bodies, currentCoverageHash, sourceCoverageHash, newCoverageHash);
  return { bodies, currentCoverageHash, newCoverageHash, sourceCoverageHash };
}

function assertCoverage(
  input: Parameters<typeof buildRepairBodies>[0],
  bodies: RepairBody[],
  currentCoverageHash: string,
  sourceCoverageHash: string,
  newCoverageHash: string
) {
  if (currentCoverageHash !== sourceCoverageHash) {
    throw new Error(`readwise_epub_source_body_coverage_mismatch:${input.documentId}`);
  }
  if (sourceCoverageHash !== newCoverageHash || bodies.length !== input.desired.length + 1) {
    const sourceContent = [
      input.structure.legacyRootBody ?? '',
      ...(input.structure.legacySections ?? []).map((section) => section.content)
    ].join('\n\n');
    const projectedContent = [
      rootSourceContent(bodies[0]!.content), ...bodies.slice(1).map((item) => item.content)
    ].join('\n\n');
    throw new Error([
      'readwise_epub_reprojected_body_coverage_mismatch', input.documentId,
      `source=${sourceCoverageHash}`, `projected=${newCoverageHash}`,
      `bodies=${bodies.length}`, `desired=${input.desired.length + 1}`,
      JSON.stringify(describeCoverageDifference(sourceContent, projectedContent))
    ].join(':'));
  }
}

function rebuildRootContent(current: string, sourceRoot: string, added: string[] | undefined) {
  const blocks = current.trim().split(/\n{2,}/u);
  const trailingLinks = blocks.at(-1)?.includes('[Open in Reader]') ? blocks.pop() : null;
  const title = /^#\s/u.test(blocks[0] ?? '') ? blocks.shift() : null;
  const localized = blocks.join('\n\n');
  const root = normalizeCoverage(localized) === normalizeCoverage(sourceRoot)
    ? localized : removeRemoteImages(sourceRoot);
  return [title, root, joinChunks(added), trailingLinks].filter(Boolean).join('\n\n');
}

function removeRemoteImages(content: string) {
  return content.replace(/!\[[^\]]*\]\(https?:\/\/[^)]*\)/giu, '**Image unavailable.**');
}

function joinChunks(chunks: string[] | undefined) {
  return (chunks ?? []).map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');
}
