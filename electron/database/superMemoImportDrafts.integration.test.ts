// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { matchSuperMemoCollection } from '../../lib/core/import/superMemoCollection.js';
import { makeSuperMemoPreviewReport } from '../../lib/core/import/superMemoPreviewReport.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import { readSuperMemoXmlDraft } from '../../lib/core/import/superMemoXmlDraft.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

const xml = `<SuperMemoCollection><Count>2</Count><SuperMemoElement>
  <ID>3</ID><Type>Topic</Type><Content><Question>正文</Question></Content>
  <SuperMemoElement><ID>12</ID><Type>Item</Type>
    <Content><Question>&lt;p&gt;题面&lt;/p&gt;</Question><Answer>答案</Answer><Sound/></Content>
    <LearningData><RepHist>Item #12&lt;br&gt;ElNo=12 Rep=2 Laps=0 Date=10.11.2026 Hour=3.5 Int=1 Grade=4&lt;br&gt;ElNo=12 Rep=1 Laps=0 Date=09.11.2026 Hour=4 Int=0 Grade=8</RepHist></LearningData>
  </SuperMemoElement></SuperMemoElement></SuperMemoCollection>`;

function parse(xmlText: string) {
  return readSuperMemoXmlDraft(new DOMParser().parseFromString(xmlText, 'application/xml'));
}

const draft = {
  elements: parse(xml)
};

it('preserves hierarchy, HTML and original review order from the XML', () => {
  expect(draft.elements).toMatchObject([
    { id: 3, parentId: null, children: [12], bodyOrQuestionHtml: ['正文'] },
    { id: 12, parentId: 3, bodyOrQuestionHtml: ['<p>题面</p>'], answerHtml: ['答案'],
      skippedAudioComponents: 1, learning: { history: [{ grade: 8 }, { grade: 4, hour: '3.5' }] } }
  ]);
  expect(() => parse(xml.replace('<ID>12</ID>', '<ID>3</ID>'))).toThrow('duplicate_supermemo_element');
  expect(() => parse(xml.replace('ElNo=12', 'ElNo=13'))).toThrow('invalid_supermemo_history_row');
});

it.each([0, 189, 190])('opens schema %s without provisioning SuperMemo tables', version => {
  const directory = mkdtempSync(join(tmpdir(), 'foliole-supermemo-'));
  const sqlite = new Database(join(directory, 'library.sqlite'));
  try {
    if (version !== 0) {
      initializeDatabaseSchema(sqlite);
      sqlite.pragma(`user_version = ${version}`);
    }
    initializeDatabaseSchema(sqlite);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name GLOB 'supermemo_import_*'").all()).toEqual([]);
    expect(sqlite.prepare('SELECT id FROM nodes').all()).toEqual([]);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('reports folder conversion, empty source entries and complete cards without creating placeholders', () => {
  const fixture = `<SuperMemoCollection><Count>4</Count><SuperMemoElement><ID>59</ID>
    <Type>Topic</Type><Title>Archive</Title>
    <SuperMemoElement><ID>2731</ID><Type>Item</Type><Content>
    <Question>&lt;p&gt;&amp;nbsp;&lt;/p&gt;</Question></Content></SuperMemoElement>
    <SuperMemoElement><ID>3856</ID><Type>Topic</Type><Title>Empty scheduled topic</Title>
    <LearningData><Interval>1</Interval><LastRepetition>27.03.2026</LastRepetition></LearningData></SuperMemoElement>
    <SuperMemoElement><ID>75</ID><Type>Item</Type>
    <Content><Question><![CDATA[Question<img src="file:///C:/missing.png"><audio src="voice.mp3"></audio>]]></Question>
    <Answer><![CDATA[Answer<img src="https://example.com/remote.png">]]></Answer><Sound/></Content>
    </SuperMemoElement></SuperMemoElement></SuperMemoCollection>`;
  const rows = describeSuperMemoSource(parse(fixture), '+08:00', DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  const report = makeSuperMemoPreviewReport({ rows, referenceDay: '2026-11-12' }, 0);
  expect(report.counts).toEqual({ folder: 1, topic: 0, item: 1, skipped: 2 });
  expect(report).toMatchObject({ localImages: 1, remoteImages: 1, skippedAudio: 2 });
  expect(report.details.map(row => [row.id, row.issue, row.sourceDue])).toEqual([
    [2731, 'empty-item', null], [3856, 'empty-topic', '2026-03-28'], [75, null, null]
  ]);
});

const samplePath = process.env.FOLIOLE_SUPERMEMO_VALIDATION_XML;
if (samplePath) it('classifies the supplied Learning sample', () => {
  const path = samplePath;
  const elements = parse(readFileSync(path, 'utf8'));
  const rows = describeSuperMemoSource(elements, '+08:00', DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  const report = makeSuperMemoPreviewReport({ rows, referenceDay: '2026-11-12' }, 0);
  expect(rows).toHaveLength(3451);
  expect(report.details.find(row => row.id === 2731)?.issue).toBe('empty-item');
  expect(report.details.find(row => row.id === 3856)?.issue).toBe('empty-topic');
  expect(rows.find(row => row.id === 75)).toMatchObject({ outcome: 'item', issue: null });
  for (const id of [59, 483, 1303, 3558]) {
    expect(rows.find(row => row.id === id)).toMatchObject({ outcome: 'folder' });
  }
});

const collectionPath = process.env.FOLIOLE_SUPERMEMO_VALIDATION_COLLECTION;
if (samplePath && collectionPath) it('pairs Learning and rejects the same IDs with incompatible learning data', () => {
  const elements = parse(readFileSync(samplePath, 'utf8'));
  const directory = collectionPath;
  function table(name: string) {
    const bytes = readFileSync(join(directory, 'info', name));
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  const tables = { tree: table('contents.dat'), elements: table('ElementInfo.dat'),
    repetitions: table('repetitions.dat'), priorities: table('priority.sub'), history: table('RepetitionHistory.dat') };
  const paired = matchSuperMemoCollection(elements, tables);
  expect(paired.size).toBe(3451);
  expect(paired.get(2)).toMatchObject({ due: '2026-06-21', rank: expect.any(Number) });
  expect(paired.get(75)?.rank).toEqual(expect.any(Number));
  const changed = elements.map(element => element.id === 2
    ? { ...element, learning: { ...element.learning!, intervalDays: '10000' } } : element);
  expect(() => matchSuperMemoCollection(changed, tables)).toThrow('supermemo_collection_mismatch');
  const otherHistory = elements.map(element => ({
    ...element, learning: element.learning && {
      ...element.learning, history: element.learning.history.map(event => ({ ...event, grade: 99 }))
    }
  }));
  expect(() => matchSuperMemoCollection(otherHistory, tables)).toThrow('supermemo_collection_mismatch');
});
