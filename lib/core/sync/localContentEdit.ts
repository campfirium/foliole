import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { projectNodeResourceLinks } from '../database/nodeResourceReferences.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { assertNodeTextFieldsWithinBudget } from '../nodes/nodeTextBudget.js';
import { normalizeNodeTitle } from '../nodes/nodeTitleBudget.js';


import type { DbPort } from './dbPort.js';
import { applyLocalContentEditBranch, type LocalContentEditOptions } from './localContentEditBranch.js';
import { assertLocalContentEditReceipt, recordLocalContentEditReceipt } from './localContentEditReceipt.js';
import { contentEditImageInputHash, localContentEditResources, localContentEditImageSources, parseNewImageReferences, type ContentImageReference } from './localContentEditResources.js';
import { retainSubmittedLocalEdit } from './nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord, loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import { hashText } from './syncNodeResolution.js';
import { mergedTopicTextBodies } from './topicTextBodies.js';
import { normalizeTextAlternativesForHash } from './topicTextState.js';

export interface LocalContentEdit {
  reveal?: string | null;
  newImageReferences?: readonly ContentImageReference[];
  baseContent?: string;
  baseVersionId: string;
  versionId: string;
}

type LocalContentEditInput = LocalContentEdit & {
  content: string;
  hideTitleHeading: boolean;
  hostName: string;
  nodeId: string;
  title: string;
  updatedAt: string;
};

/** Uses the same version graph and resolution as an offline edit arriving from a peer. */
export async function applyLocalContentEdit(port: DbPort, input: LocalContentEditInput,
  applyFastForward?: (record: NativeSyncNodeRecord) => void, options: LocalContentEditOptions = {}) {
  return port.transaction(async (tx) => {
    const [live] = await tx.query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM nodes WHERE id = ?', [input.nodeId]
    );
    if (!live || live.deleted_at) throw new Error('content_edit_node_unavailable');
    const base = await loadRetainedSyncNodeVersionFact(tx, input.baseVersionId);
    if (!base || base.object_id !== input.nodeId) throw new Error('content_edit_base_unavailable');
    if (input.baseContent !== undefined) {
      const hash = base.snapshot.body_blob_hash ?? (typeof base.body_text === 'string' ? hashTextBody(base.body_text) : null);
      if (hash !== hashTextBody(input.baseContent)) throw new Error('content_edit_base_content_mismatch');
      base.body_text = input.baseContent;
    }
    if (input.title !== base.snapshot.title) input = { ...input, title: normalizeNodeTitle(input.title) };
    assertNodeTextFieldsWithinBudget(input);
    const stored = await loadRetainedSyncNodeVersionFact(tx, input.versionId, false);
    const current = await loadCurrentSyncNodeRecord(tx, input.nodeId, Boolean(stored));
    if (!current) throw new Error('content_edit_current_version_unavailable');
    if (base.body_text === null && typeof current.body_text === 'string' && hashTextBody(current.body_text) === base.snapshot.body_blob_hash) {
      base.body_text = current.body_text;
    }
    const added = parseNewImageReferences(input.newImageReferences);
    const imageInputHash = contentEditImageInputHash(added);
    const bodyHash = input.content === base.body_text ? base.snapshot.body_blob_hash : hashTextBody(input.content);
    const sameBody = input.content === base.body_text || bodyHash === base.snapshot.body_blob_hash;
    if (stored) {
      await assertLocalContentEditReceipt(tx, input.versionId, imageInputHash);
      if (!matchesEdit(stored, base, input, bodyHash)) throw new Error('content_edit_version_mismatch');
      if (current.version_id === input.versionId || current.ancestor_version_ids.includes(input.versionId)) {
        return { current, submittedVersionId: input.versionId };
      }
    }
    if (!stored && sameBody && (input.reveal === undefined || input.reveal === base.snapshot.reveal) && added.length === 0) return { current, submittedVersionId: base.version_id! };
    const reveal = input.reveal === undefined ? base.snapshot.reveal : input.reveal;
    const imageSources = stored?.snapshot.image_sources ?? localContentEditImageSources(current, input.content + '\n' + (reveal ?? ''), added);
    const record = createEditRecord(base, input, sameBody, bodyHash, imageSources,
      stored?.snapshot.resource_references ?? localContentEditResources(base, current, input.content, added, input.reveal));
    record.alternative_bodies = mergedTopicTextBodies(record.snapshot.text_alternatives ?? [], [base, current]);
    await retainSubmittedLocalEdit(tx, input.nodeId, input.baseVersionId, input.versionId);
    if (current.version_id === input.baseVersionId && applyFastForward) applyFastForward(record);
    else await applyLocalContentEditBranch(tx, stored?.body_text === null ? record : stored ?? record, options);
    await recordLocalContentEditReceipt(tx, input.versionId, imageInputHash);
    await tx.run('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
    await collectNodeVersionPayloads(tx, input.nodeId, Number.MAX_SAFE_INTEGER);
    const applied = await loadCurrentSyncNodeRecord(tx, input.nodeId, false);
    if (!applied) throw new Error('content_edit_result_unavailable');
    return { current: applied, submittedVersionId: input.versionId };
  });
}

function createEditRecord(base: NativeSyncNodeRecord, input: LocalContentEditInput,
  sameBody: boolean, bodyHash: string | null | undefined, imageSources: string | null, resources?: string): NativeSyncNodeRecord {
  const snapshot = {
    ...base.snapshot,
    ...(resources === undefined ? {} : { resource_references: resources, attachments: projectNodeResourceLinks(resources) }),
    image_sources: imageSources,
    body_blob_hash: null,
    content: input.content,
    ...(input.reveal === undefined ? {} : { reveal: input.reveal }),
    hide_title_heading: input.hideTitleHeading,
    title: input.title,
    updated_at: input.updatedAt,
    text_selection: sameBody
      ? base.snapshot.text_selection ?? { version_id: base.version_id!, created_at: base.version_created_at! }
      : { version_id: input.versionId, created_at: input.updatedAt },
    text_alternatives: normalizeTextAlternativesForHash(base.snapshot.text_alternatives ?? [], bodyHash ?? hashTextBody(input.content), input.updatedAt)
  };
  delete snapshot.body_deleted;
  return {
    ...base,
    ancestor_version_ids: [input.baseVersionId, ...base.ancestor_version_ids],
    body_text: input.content,
    content_hash: hashText(JSON.stringify(snapshot)),
    host_name: input.hostName,
    parent_version_id: input.baseVersionId,
    parent_version_ids: [input.baseVersionId],
    snapshot,
    updated_at: input.updatedAt,
    version_created_at: input.updatedAt,
    version_id: input.versionId
  };
}

function matchesEdit(stored: NativeSyncNodeRecord, base: NativeSyncNodeRecord,
  input: LocalContentEditInput, bodyHash: string | null | undefined) {
  return stored.parent_version_id === input.baseVersionId
    && stored.object_id === base.object_id
    && stored.host_name === input.hostName
    && (stored.body_text === input.content || stored.snapshot.body_blob_hash === (bodyHash ?? hashTextBody(input.content)))
    && stored.snapshot.reveal === (input.reveal === undefined ? base.snapshot.reveal : input.reveal)
    && stored.snapshot.title === input.title
    && stored.snapshot.hide_title_heading === input.hideTitleHeading
    && stored.updated_at === input.updatedAt;
}
