import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { UpsertNodeSnapshotInput } from '../../lib/core/database/nodeMutations.js';
import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import * as specialNodeIds from '../../lib/core/database/specialNodeIds.js';
import {
  getGuidedSampleContent,
  GUIDED_SAMPLE_PRIORITY,
  type GuidedSampleTopicTemplate
} from '../../lib/core/guidedSample/guidedSampleContent.js';
import type { RegisteredAppLocale } from '../../lib/core/localization/appLocaleRegistry.js';
import { deriveNodeTitleFromContent } from '../../lib/core/nodes/deriveNodeTitle.js';
import type { ContentImageReference } from '../../lib/core/sync/localContentEditResources.js';
import { importImageAttachmentBytes } from '../attachments/importImageAttachmentBytes.js';

import { openDatabaseConnection } from './connection.js';
import { clearGuidedSampleSeedState, markGuidedSampleSeeded, readGuidedSampleSeedState } from './guidedSampleSeedState.js';
import { upsertVersionedNodeSnapshotWithOrder } from './nodeVersionedMutations.js';

const SPECIAL_NODE_IDS: string[] = Object.values(specialNodeIds);

export interface GuidedSampleSeedOptions {
  assetDirs: readonly string[];
  locale: RegisteredAppLocale;
}

function hasLibraryContent(driver: DatabaseDriver) {
  const placeholders = SPECIAL_NODE_IDS.map(() => '?').join(', ');
  const row = driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM nodes WHERE id NOT IN (${placeholders})`,
    SPECIAL_NODE_IDS
  );
  return (row?.count ?? 0) > 0;
}

async function readAssetBytes(assetDirs: readonly string[], assetId: string) {
  for (const assetDir of assetDirs) {
    try {
      return new Uint8Array(await fs.readFile(path.join(assetDir, `${assetId}.png`)));
    } catch {
      continue;
    }
  }
  return null;
}

async function importTopicImages(assetDirs: readonly string[], topic: GuidedSampleTopicTemplate) {
  const references: ContentImageReference[] = [];
  for (const assetId of topic.attachmentIds) {
    const bytes = await readAssetBytes(assetDirs, assetId);
    if (!bytes) continue;
    const result = await importImageAttachmentBytes({
      bytes, errorSource: '[guided-sample]', mimeType: 'image/png', originalName: `${assetId}.png`
    });
    if (result.status === 'imported') {
      references.push({ original_name: result.original_name, role: 'image', storage_key: result.storage_key });
    }
  }
  return references;
}

function createTopicSnapshot(topic: GuidedSampleTopicTemplate, parentNodeId: string, timestamp: string): UpsertNodeSnapshotInput {
  return {
    anchorLink: null, content: topic.content, createdAt: timestamp, desiredRetention: null, enableShortTerm: null,
    hideTitleHeading: false, imageRegions: null, imageSources: null, isTitleManual: false, kind: 'topic',
    manualChildOrder: null, nodeId: `node-${randomUUID()}`, parentNodeId, position: null,
    priority: GUIDED_SAMPLE_PRIORITY, reading: null, reveal: null, review: null, sequentialReadingEnabled: null,
    shelvedAt: null, title: deriveNodeTitleFromContent(topic.content), updatedAt: timestamp, virtualFilter: null
  };
}

function insertSampleTopics(
  driver: DatabaseDriver,
  topics: GuidedSampleTopicTemplate[],
  images: ContentImageReference[][]
) {
  const startedAt = Date.now();
  const rest = loadDerivedNodeOrder(driver).filter((nodeId) => nodeId !== specialNodeIds.INBOX_NODE_ID);
  const placed: string[] = [];
  topics.forEach((topic, index) => {
    // Distinct creation times keep the sample's sibling order stable wherever it syncs.
    const timestamp = new Date(startedAt + index).toISOString();
    const snapshot = createTopicSnapshot(topic, placed[0] ?? specialNodeIds.INBOX_NODE_ID, timestamp);
    placed.push(snapshot.nodeId);
    const newImageReferences = images[index] ?? [];
    upsertVersionedNodeSnapshotWithOrder(
      snapshot,
      [specialNodeIds.INBOX_NODE_ID, ...placed, ...rest],
      newImageReferences.length ? { newImageReferences } : {}
    );
  });
  markGuidedSampleSeeded(driver, placed[0]!, new Date(startedAt).toISOString());
  return placed;
}

/** Writes the guided sample into a library that was just created and is still untouched. */
export async function seedPendingGuidedSample(options: GuidedSampleSeedOptions): Promise<string[] | null> {
  const driver = openDatabaseConnection().driver;
  if (readGuidedSampleSeedState(driver)?.kind !== 'pending') return null;
  if (hasLibraryContent(driver)) {
    clearGuidedSampleSeedState(driver);
    return null;
  }
  const content = getGuidedSampleContent(options.locale);
  const topics = [content.root, ...content.children];
  const images: ContentImageReference[][] = [];
  for (const topic of topics) images.push(await importTopicImages(options.assetDirs, topic));
  return driver.transaction((transaction) => {
    if (readGuidedSampleSeedState(transaction)?.kind !== 'pending' || hasLibraryContent(transaction)) return null;
    return insertSampleTopics(transaction, topics, images);
  });
}
