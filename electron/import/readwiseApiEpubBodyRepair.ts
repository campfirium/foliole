import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseApiEpubCover } from './readwiseApiEpubCover.js';
import type { ReadwiseApiEpubCoverRemote } from './readwiseApiEpubCoverRepair.js';
import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';
import { mergeRetainedReadwiseAnnotations } from './readwiseOriginalEpubAnnotations.js';
import { commitFrozenReadwiseSourceResync } from './readwiseSourceResyncCommit.js';
import {
  captureReadwiseSourceResyncSnapshot,
  loadReadwiseSourceResyncTarget
} from './readwiseSourceResyncTarget.js';

interface ReadwiseApiEpubBodyRemote extends ReadwiseApiEpubCoverRemote {
  author?: string | null;
  createdAt?: string | null;
  htmlContent: string | null;
  sourceUrl?: string | null;
  updatedAt?: string | null;
  url?: string | null;
}

export async function repairReadwiseApiEpubBodiesFromRemote(
  nodeId: string,
  remote: ReadwiseApiEpubBodyRemote
) {
  const target = loadReadwiseSourceResyncTarget(nodeId);
  if (!target || target.documentId !== remote.id) throw new Error('readwise_body_repair_target_missing');
  const prepared = prepareReadwiseApiDocuments([toContract(remote, target.title)], [])[0];
  if (!prepared?.epubStructure) throw new Error('readwise_body_repair_structure_missing');
  const document = {
    ...prepared,
    annotations: mergeRetainedReadwiseAnnotations(target, prepared.annotations)
  };
  const [cover, images] = await Promise.all([
    prepareReadwiseApiEpubCover(document),
    prepareReadwiseApiEpubImages(document)
  ]);
  const expectedSnapshot = captureReadwiseSourceResyncSnapshot(target);
  commitFrozenReadwiseSourceResync({
    candidate: { cover, document, images },
    expectedSnapshot,
    importedAt: new Date().toISOString(),
    target
  });
  return {
    accounting: images?.accounting ?? null,
    degradedReason: images?.degradedReason ?? cover.degradedReason,
    nodeId,
    status: 'repaired' as const
  };
}

function toContract(remote: ReadwiseApiEpubBodyRemote, title: string) {
  return {
    author: remote.author ?? null, category: remote.category === 'epub' ? 'epub' as const : null,
    createdAt: remote.createdAt ?? null, htmlContent: remote.htmlContent, id: remote.id,
    imageUrl: remote.imageUrl, notes: null, parentId: null, rawSourceUrl: null,
    sourceUrl: remote.sourceUrl ?? null, summary: null, title,
    updatedAt: remote.updatedAt ?? null, url: remote.url ?? null
  };
}
