// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { readSuperMemoXmlDraft } from '../../lib/core/import/superMemoXmlDraft.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));

function parse(xml: string) {
  return readSuperMemoXmlDraft(new DOMParser().parseFromString(xml, 'application/xml'));
}

async function importXml(xml: string, verify: (facts: {
  batch: { entries: Array<{ id: number; nodeId: string; learning: { history: object[] } }> };
  source: RestorePeer;
}) => void) {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  try {
    source.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(source.id), new Date().toISOString());
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: source.id, libraryPath: source.file });
    const args = { elements: parse(xml), percent: 0 };
    const preview = await handleSuperMemoImportCommand(NATIVE_COMMANDS.previewSuperMemoImport, args);
    if (!preview || !('rows' in preview)) throw new Error('missing SuperMemo preview');
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport,
      { ...args, previewSignature: preview.previewSignature });
    if (!result || !('batchId' in result)) throw new Error('missing SuperMemo import result');
    source.reopen();
    const stored = source.sqlite.prepare('SELECT value FROM workspace_meta WHERE key = ?')
      .pluck().get(`supermemo-import:${result.batchId}`) as string;
    const batch = JSON.parse(stored);
    verify({ batch, source });
    return result;
  } finally {
    connection.driver = null;
    await fixture.close();
  }
}

it('imports a cross-midnight review and keeps the source learning day for scheduling', async () => {
  const xml = `<SuperMemoCollection><Count>1</Count><SuperMemoElement><ID>12</ID><Type>Item</Type>
    <Content><Question>Test question</Question><Answer>Test answer</Answer></Content>
    <LearningData><LastRepetition>30.09.2025</LastRepetition><Interval>2</Interval>
      <RepHist>ElNo=12 Rep=3 Laps=0 Date=30.09.2025 Hour=45.037 Int=0 Grade=5&lt;br&gt;ElNo=12 Rep=2 Laps=0 Date=30.09.2025 Hour=14.085 Int=2 Grade=4</RepHist>
    </LearningData></SuperMemoElement></SuperMemoCollection>`;
  const result = await importXml(xml, ({ batch, source }) => {
    const entry = batch.entries[0]!;
    const timestamps = source.sqlite.prepare('SELECT reviewed_at FROM review_log WHERE node_id = ? ORDER BY reviewed_at')
      .pluck().all(entry.nodeId);
    const sourceOffset = new Date().getTimezoneOffset() * 60_000;
    expect(timestamps).toEqual([
      new Date(Date.UTC(2025, 8, 30, 14, 5, 6) + sourceOffset).toISOString(),
      new Date(Date.UTC(2025, 9, 1, 21, 2, 13) + sourceOffset).toISOString()
    ]);
    expect(entry.learning.history).toMatchObject([{ date: '30.09.2025', hour: '14.085' },
      { date: '30.09.2025', hour: '45.037', raw: expect.stringContaining('Hour=45.037') }]);
    const due = source.sqlite.prepare('SELECT due FROM node_review WHERE node_id = ?').pluck().get(entry.nodeId);
    expect(due).toBe(new Date(2025, 9, 2).toISOString());
  });
  expect(result).toMatchObject({ imported: 1, skipped: 0 });
});
