import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { deployCloudflarePages } from './cloudflarePagesClient.js';
import {
  markTopicsUnpublishedBySourceKeys,
  readPublishIndex,
  type FoliolePublishTopic,
  writePublishIndex
} from './foliolePublishModel.js';
import { loadFoliolePublishToken, loadStoredFoliolePublishSettings } from './foliolePublishSettings.js';
import { activateFoliolePublishSite, discardStagedFoliolePublishSite, stageFoliolePublishSite } from './foliolePublishSite.js';

function publishRoot() { return path.join(loadLibraryPathSettingsSync().library_home, 'Publish'); }

function topicUrl(topic: FoliolePublishTopic, siteAddress: string) {
  return `${siteAddress}/topics/${topic.number}/`;
}

function readSourceStates(nodeIds: string[]) {
  if (nodeIds.length === 0) return new Map<string, 'active' | 'trash'>();
  const placeholders = nodeIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<{ deleted_at: string | null; id: string }>(
    `SELECT id, deleted_at FROM nodes WHERE id IN (${placeholders})`, nodeIds
  );
  return new Map(rows.map((row) => [row.id, row.deleted_at ? 'trash' as const : 'active' as const]));
}

export function loadFoliolePublishedTopics() {
  const index = readPublishIndex(publishRoot());
  const settings = loadStoredFoliolePublishSettings();
  const published = index.topics.filter((topic) => topic.status === 'published');
  const states = readSourceStates(published.map((topic) => topic.source_node_id));
  return {
    status: 'ready' as const,
    topics: published.map((topic) => ({
      node_id: topic.source_node_id,
      number: topic.number,
      source_key: topic.source_key,
      source_state: states.get(topic.source_node_id) ?? 'missing',
      title: topic.title,
      updated_at: topic.updated_at,
      url: settings ? topicUrl(topic, settings.site_address) : null
    }))
  };
}

function expandSubtreeNodeIds(nodeIds: readonly string[]) {
  if (nodeIds.length === 0) return [];
  const values = nodeIds.map(() => '(?)').join(', ');
  return openDatabaseConnection().driver.queryAll<{ id: string }>(
    `WITH RECURSIVE requested(id) AS (VALUES ${values}),
       descendants(id) AS (
         SELECT id FROM requested
         UNION
         SELECT nodes.id FROM nodes JOIN descendants ON nodes.parent_id = descendants.id
       )
     SELECT DISTINCT id FROM descendants`, [...nodeIds]
  ).map((row) => row.id);
}

export function inspectFoliolePublishedDelete(nodeIds: readonly string[]) {
  const index = readPublishIndex(publishRoot());
  const targets = new Set(expandSubtreeNodeIds(nodeIds));
  const published = index.topics.filter((topic) => topic.status === 'published' && targets.has(topic.source_node_id));
  return published.length > 0
    ? { published_node_ids: published.map((topic) => topic.source_node_id), source_keys: published.map((topic) => topic.source_key), status: 'requires_unpublish' as const }
    : { status: 'allowed' as const };
}

export class FoliolePublishedDeleteBlockedError extends Error {
  constructor(readonly sourceKeys: string[]) {
    super('Unpublish this Topic from your Foliole site before moving it to Trash.');
    this.name = 'FoliolePublishedDeleteBlockedError';
  }
}

export function assertFoliolePublishedDeleteAllowed(nodeIds: readonly string[]) {
  const result = inspectFoliolePublishedDelete(nodeIds);
  if (result.status === 'requires_unpublish') throw new FoliolePublishedDeleteBlockedError(result.source_keys);
}

function commitUnpublishedSite(staged: string, index: ReturnType<typeof readPublishIndex>) {
  const activation = activateFoliolePublishSite(publishRoot(), staged);
  try { writePublishIndex(publishRoot(), index); activation.commit(); }
  catch (error) { activation.rollback(); throw error; }
  finally { discardStagedFoliolePublishSite(staged); }
}

export async function unpublishFolioleTopics(sourceKeys: readonly string[]) {
  const settings = loadStoredFoliolePublishSettings();
  const token = loadFoliolePublishToken();
  if (!settings || !token) throw new Error('Reconnect Cloudflare before unpublishing from the site.');
  const current = readPublishIndex(publishRoot());
  const next = markTopicsUnpublishedBySourceKeys(current, sourceKeys);
  const staged = stageFoliolePublishSite(publishRoot(), next, settings.site_address);
  try {
    await deployCloudflarePages({ accountId: settings.account_id, projectName: settings.project_name, siteRoot: staged, token });
  } catch (error) { discardStagedFoliolePublishSite(staged); throw error; }
  try { commitUnpublishedSite(staged, next); }
  catch (error) {
    return { status: 'deployed_local_unpublish_state_failed' as const, warning: error instanceof Error ? error.message : String(error) };
  }
  return { status: 'unpublished' as const };
}
