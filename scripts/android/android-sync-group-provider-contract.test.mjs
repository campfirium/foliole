// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const javaRoot = path.join(root, 'android/app/src/main/java/com/foliole/android');
const readJava = (name) => readFile(path.join(javaRoot, name), 'utf8');

it('serves the established content blob batch route instead of provisioning through single blob requests', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const batch = await readJava('FolioleCompanionSyncGroupContentBlobBatch.java');
  expect(server).toContain('pathOnly.equals("/companion/content-blobs")');
  expect(batch).toContain('private static final int MAX_BATCH_SIZE = 32;');
  expect(batch).toContain('WHERE cb.hash IN (');
  expect(batch).toContain('X-Blob-Hash: ');
});

it('authorizes every Android provider data request with both the channel secret and member fact', async () => {
  const auth = await readJava('FolioleCompanionSyncGroupRequestAuth.java');
  const database = await readJava('FolioleCompanionSyncGroupDatabase.java');
  expect(auth).toContain('FolioleCompanionSyncGroupDatabase.requireAuthorizedMember');
  expect(database).toContain("state = 'active'");
});

it('makes approval the only membership transition and does not expose remote activation', async () => {
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  const database = await readJava('FolioleCompanionSyncGroupDatabase.java');
  expect(database).toContain("VALUES (?, ?, ?, ?, 'active'");
  expect(server).not.toContain('/companion/sync-group/activate');
});

it('keeps the Android screen awake only around foreground provider activity', async () => {
  const provider = await readJava('FolioleCompanionSyncGroupProvider.java');
  const plugin = await readJava('FolioleCompanionSyncPlugin.java');
  const awake = await readJava('FolioleCompanionSyncScreenAwake.java');
  expect(provider).toContain('FolioleCompanionSyncScreenAwake.touch()');
  expect(provider).toContain('FolioleCompanionSyncScreenAwake.clear()');
  expect(plugin).toContain('FolioleCompanionSyncGroupProvider.pause()');
  expect(plugin).toContain('FolioleCompanionSyncGroupProvider.resume()');
  expect(awake).toContain('FLAG_KEEP_SCREEN_ON');
});

it('records the exact cursor returned by the Android pack snapshot', async () => {
  const provider = await readJava('FolioleCompanionSyncPackProvider.java');
  const server = await readJava('FolioleCompanionSyncGroupServer.java');
  expect(provider).toContain('pack.execSQL("BEGIN")');
  expect(provider).toContain('new BuildResult(zip(');
  expect(server).toContain('peer, after, pack.toSeq');
});
