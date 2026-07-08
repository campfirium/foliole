import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionAttachmentResourceQueryDefinitions.js';
import { ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionContentResourceQueryDefinitions.js';
import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionCoreSchemaStatements.js';
import { ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionLearningPayloadQueryDefinitions.js';
import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from '../../lib/core/database/androidCompanionNodeResourceQueryDefinitions.js';
import { ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/androidCompanionResourceSchemaStatements.js';

let database: Database.Database;

beforeEach(() => {
  database = new Database(':memory:');
  for (const statement of [
    ...ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS,
    ...ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS
  ]) {
    database.exec(statement);
  }
  seedDeletedParentLiveChildFixture();
});

afterEach(() => {
  database.close();
});

function expectVisibleNodes(sql: string) {
  expect(sql).toContain('WITH RECURSIVE visible_nodes');
  expect(sql).toContain('visible_nodes visible');
}

it('keeps Android companion node consumers scoped to visible node ancestry', () => {
  expectVisibleNodes(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.topicSearch.sql);
  expectVisibleNodes(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.readableArticleFirstNode.sql);
  expectVisibleNodes(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceOrderedNodeIds.sql);
  expectVisibleNodes(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql);
});

it('keeps Android companion resource priority queries scoped to visible node ancestry', () => {
  expectVisibleNodes(ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS.contentBlobMissingHashes.sql);
  expectVisibleNodes(ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS.contentBlobMissingSummaryRows.sql);
  expectVisibleNodes(ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS.attachmentResourceMissingRows.sql);
  expectVisibleNodes(ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS.attachmentResourceMissingSummaryRows.sql);
});

it('keeps Android companion learning payload queries scoped to visible node ancestry', () => {
  expectVisibleNodes(ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReading.sql);
  expectVisibleNodes(ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReview.sql);
});

it('executes Android companion visible-node queries without surfacing hidden descendants', () => {
  expect(ids(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceOrderedNodeIds.sql)).toEqual(['visible-root']);
  expect(ids(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.topicSearch.sql, hiddenSearchArgs())).toEqual([]);
  expect(ids(ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.readableArticleFirstNode.sql)).toEqual(['visible-root']);
  expect(
    database.prepare(workspaceSnapshotSql()).all('device-1')
  ).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'hidden-child', next_at: null, due: null }),
    expect.objectContaining({ id: 'visible-root', next_at: null, due: null })
  ]));
  expect(database.prepare(ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReading.sql).all('hidden-child'))
    .toEqual([]);
  expect(database.prepare(ANDROID_COMPANION_LEARNING_PAYLOAD_QUERY_DEFINITIONS.syncPayloadNodeReview.sql).all('hidden-child'))
    .toEqual([]);
});

function ids(sql: string, params: unknown[] = []) {
  return database.prepare(sql).all(...params).map((row) => (row as { id: string }).id);
}

function hiddenSearchArgs() {
  return ['hidden', 'hidden', 'hidden', 'hidden', 'hidden', 20];
}

function workspaceSnapshotSql() {
  return ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql
    .replace('__CONTENT_EXPRESSION__', 'n.content')
    .replace('__BODY_STATUS_EXPRESSION__', "'inline'")
    .replace('__CONTENT_BLOB_JOIN__', '');
}

function seedDeletedParentLiveChildFixture() {
  insertNode('deleted-parent', null, 'Deleted parent', 'deleted parent body', '2026-04-21T09:00:00.000Z');
  insertNode('hidden-child', 'deleted-parent', 'Hidden child', 'hidden body', null);
  insertNode('visible-root', null, 'Visible root', 'visible body', null);
  database.prepare('INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES (?, ?, ?)').run(
    'hidden-child',
    '2026-04-21T10:00:00.000Z',
    '2026-04-21T11:00:00.000Z'
  );
  database.prepare('INSERT INTO node_review (node_id, due) VALUES (?, ?)').run(
    'hidden-child',
    '2026-04-21T11:00:00.000Z'
  );
}

function insertNode(
  id: string,
  parentId: string | null,
  title: string,
  content: string,
  deletedAt: string | null
) {
  database.prepare(
    `INSERT INTO nodes (id, parent_id, kind, title, content, is_title_manual, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'topic', ?, ?, 1, '2026-04-21T08:00:00.000Z', '2026-04-21T08:00:00.000Z', ?)`
  ).run(id, parentId, title, content, deletedAt);
}
