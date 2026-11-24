// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { normalizeAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';
import type { DatabaseBindParams } from '../../lib/core/database/driver.js';
import { closeAgentControlTestServer, startAgentControlTestServer } from '../agentControl/agentControlTestServer.js';
import { AGENT_CONTROL_PROTOCOL_VERSION, type AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import { executeAideTool } from './aideToolExecutor.js';
import { createAideToolSession } from './aideToolSession.js';

let db: DatabaseSync;

vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<object>(),
  openDatabaseConnection: () => ({
    driver: {
      queryAll: (sql: string, params: DatabaseBindParams = []) => db.prepare(sql).all(...params),
      queryOne: (sql: string, params: DatabaseBindParams = []) => db.prepare(sql).get(...params)
    }
  })
}));
vi.mock('../database/externalSearchCache.js', () => ({ searchExternalDocuments: () => [] }));
vi.mock('../database/searchAliasMirror.js', () => ({ getEffectiveSearchAliases: () => ({ groups: [] }) }));
vi.mock('../database/storedRemovedSourceSearch.js', () => ({ searchRemovedSources: () => [] }));
vi.mock('../diagnostics/diagnosticLog.js', () => ({ appendDiagnosticLog: vi.fn() }));

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT, title TEXT, anchor_link TEXT,
      deleted_at TEXT, virtual_filter TEXT, manual_child_order TEXT);
    ATTACH DATABASE ':memory:' AS search;
    CREATE VIRTUAL TABLE search.node_search USING fts5(
      title, path, content, node_id UNINDEXED, updated_at UNINDEXED, is_trashed UNINDEXED);
    CREATE VIRTUAL TABLE search.pdf_search USING fts5(
      title, path, text, node_id UNINDEXED, attachment_id UNINDEXED, page UNINDEXED,
      updated_at UNINDEXED, page_text_length UNINDEXED, is_trashed UNINDEXED);
    CREATE TABLE search.pdf_page_map (row_id INTEGER, node_id TEXT, attachment_id TEXT, page INTEGER);
  `);
  for (let index = 1; index <= 45; index++) {
    const rank = String(index).padStart(2, '0');
    insertMaterial(`outside-${rank}`, `2026-11-24T12:${rank}:00Z`);
  }
  insertMaterial('allowed-older', '2026-11-23T12:00:00Z');
  insertMaterial('allowed-newer', '2026-11-23T12:01:00Z');
});

afterEach(() => db.close());

function insertMaterial(id: string, updatedAt: string) {
  db.prepare("INSERT INTO nodes (id, kind, title) VALUES (?, 'topic', 'Needle')").run(id);
  db.prepare(`INSERT INTO search.node_search (title, path, content, node_id, updated_at, is_trashed)
    VALUES ('Needle', '', '', ?, ?, 0)`).run(id, updatedAt);
}

const read = {
  baseTopic: false, current: true, dives: false, external: false, folder: false, home: false, trash: false, virtual: false
};

function createDescriptor(endpoint: string): AgentControlSessionDescriptor {
  return {
    capabilities: ['materials.search'],
    endpoint,
    pid: process.pid,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    runtime_identity: { boot_id: 'test', database_device_id_hash: null, pid: process.pid, started_at: 'now' },
    started_at: 'now',
    token: 'test-token'
  };
}

async function searchWithAide(endpoint: string, limit: number, currentIds: string[]) {
  const session = createAideToolSession(normalizeAideToolPermissionSettings({ read }), undefined, currentIds);
  const result = await executeAideTool({ arguments: { limit, query: 'needle' }, tool: 'search_materials' }, {
    descriptor: createDescriptor(endpoint),
    session
  });
  expect(result.success).toBe(true);
  const text = result.contentItems[0]!.text;
  expect(session.readUsed).toBeGreaterThan(0);
  return JSON.parse(text) as Record<string, unknown>;
}

it.each([
  { limit: 1, expected: ['allowed-newer'] },
  { limit: 40, expected: ['allowed-newer', 'allowed-older'] }
])('fills a scoped page of $limit when higher-ranked matches are outside the scope', async ({ limit, expected }) => {
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    const result = await searchWithAide(endpoint, limit, ['allowed-older', 'allowed-newer']);
    expect(result).toEqual({
      count: expected.length,
      limit,
      query: 'needle',
      results: expected.map((id) => expect.objectContaining({ id }))
    });
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('keeps ordinary Agent Control pagination global and returns no scoped hit when none is allowed', async () => {
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    const response = await fetch(`${endpoint}/agent-control/v1/materials/search`, {
      body: JSON.stringify({ limit: 1, offset: 0, query: 'needle' }),
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      method: 'POST'
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      count: 1,
      next_offset: 1,
      results: [expect.objectContaining({ id: 'outside-45' })]
    });
    expect(await searchWithAide(endpoint, 1, [])).toEqual({
      count: 0, limit: 1, query: 'needle', results: []
    });
  } finally {
    await closeAgentControlTestServer(server);
  }
});

it('applies the permitted material scope to a PDF hit from that material', async () => {
  db.prepare("INSERT INTO nodes (id, kind, title) VALUES ('pdf-owner', 'topic', 'PDF owner')").run();
  db.prepare(`INSERT INTO search.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length, is_trashed)
    VALUES ('PDF owner', '', 'needle on this page', 'pdf-owner', 'attachment', 1, '2026-11-23T12:02:00Z', 19, 0)`).run();
  const { endpoint, server } = await startAgentControlTestServer();
  try {
    expect(await searchWithAide(endpoint, 1, ['pdf-owner'])).toMatchObject({
      count: 1,
      results: [{
        id: 'pdf-owner', kind: 'pdf',
        match: { attachment_id: 'attachment', kind: 'pdf', page: 1 }
      }]
    });
  } finally {
    await closeAgentControlTestServer(server);
  }
});
