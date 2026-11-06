// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { loadTopicTextStateWithDriver } from '../../lib/core/database/topicTextStateWithDriver.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(host => host.sqlite.close()));

it('saves a draft after its old alternative was dismissed and its old payload collected', async () => {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('main', 'The main article', base)]);
  const inputBase = await host.receive([textBranch('other', 'Other draft', base)]);
  const driver = createBetterSqlite3Driver(host.sqlite);
  const [alternative] = loadTopicTextStateWithDriver(driver, 'topic');
  expect(alternative).toBeDefined();
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: alternative!.id,
    action: 'dismissed', now: new Date().toISOString(), versionId: 'dismiss', hostName: 'desktop' });
  await expect(applyLocalContentEdit(host.db, {
    nodeId: 'topic', baseVersionId: inputBase.version_id!, baseContent: inputBase.body_text!,
    versionId: 'continued', content: 'The main article with continued input', title: 'Topic',
    hideTitleHeading: false, hostName: 'desktop', updatedAt: new Date().toISOString()
  })).resolves.toBeDefined();
  expect((await host.current()).body_text).toBe('The main article with continued input');
  expect(loadTopicTextStateWithDriver(driver, 'topic')).toEqual([]);
});

it('changes only the main body without copying an unchanged alternative into the new version', async () => {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('main', 'The main article', base)]);
  const current = await host.receive([textBranch('other', 'Other draft', base)]);
  const driver = createBetterSqlite3Driver(host.sqlite);
  const alternatives = loadTopicTextStateWithDriver(driver, 'topic');
  await applyLocalContentEdit(host.db, { nodeId: 'topic', baseVersionId: current.version_id!,
    baseContent: current.body_text!, versionId: 'edit', content: 'The main article continued',
    title: 'Topic', hideTitleHeading: false, hostName: 'desktop', updatedAt: new Date().toISOString() });
  expect(loadTopicTextStateWithDriver(driver, 'topic')).toEqual(alternatives);
  const { snapshot_json: snapshot } = host.sqlite.prepare(
    'SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?').get('edit') as { snapshot_json: string };
  expect(JSON.parse(snapshot).text_alternative_bodies ?? []).toEqual([]);
  expect(JSON.parse(snapshot).text_alternatives ?? []).toEqual([]);
});
