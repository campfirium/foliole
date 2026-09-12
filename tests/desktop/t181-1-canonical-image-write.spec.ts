import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, TestInfo } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_IMAGE = path.resolve('assets/brand/foliole-leaf-tight.png');
const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const NODE_ID = 't181-1-canonical-image-write';

async function inspectAttachment(desktopApp: ElectronApplication, nodeId: string) {
  return desktopApp.evaluate((_electron, targetNodeId) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const sqlite = connection.openDatabaseConnection().sqlite;
      return sqlite.prepare(
        `SELECT a.id attachmentId, a.mime_type mimeType, b.content_hash contentHash,
          b.storage_key storageKey, COUNT(na.node_id) linkCount
         FROM attachments a JOIN attachment_blobs b ON b.attachment_id = a.id
         JOIN node_attachments na ON na.attachment_id = a.id
         WHERE na.node_id = ? GROUP BY a.id, a.mime_type, b.content_hash, b.storage_key`
      ).get(targetNodeId);
    });
  }, nodeId);
}

async function inspectRestartReadability(
  desktopApp: ElectronApplication,
  input: { contentHash: string; storageKey: string; storagePath: string }
) {
  return desktopApp.evaluate(({ nativeImage }, payload) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const resolver = require(pathApi.join(process.cwd(), 'dist/electron/attachments/resourceResolver.js'));
    const resolution = resolver.resolveAttachmentResource(payload.storageKey);
    const decoded = nativeImage.createFromPath(payload.storagePath);
    return { decodedSize: decoded.getSize(), imageEmpty: decoded.isEmpty(), resolution };
  }, input);
}

async function writeEvidence(input: {
  attachment: unknown;
  content: string;
  readback: unknown;
  sourcePath: string;
  storagePath: string;
  testInfo: TestInfo;
}) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const evidencePath = path.join(ARTIFACT_DIR, 't181-1-canonical-image-write.json');
  const { testInfo, ...evidence } = input;
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await testInfo.attach('t181-1-canonical-image-write', {
    contentType: 'application/json', path: evidencePath
  });
}

test('imports misleading image extension to one canonical key across relaunch', async ({ desktopSession }, testInfo) => {
  test.setTimeout(180_000);
  const stateRoot = desktopSession.target.runtimeStateRoot;
  const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!libraryHome) throw new Error('missing isolated library home');
  const sourcePath = path.join(stateRoot, 'misleading-source.jpeg');
  const bytes = await fs.readFile(SOURCE_IMAGE);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const storageKey = `${contentHash}.png`;
  const storagePath = path.join(libraryHome, 'Assets', storageKey);
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  await fs.writeFile(sourcePath, bytes);

  try {
    await expectWorkspaceShell(desktopSession.firstWindow);
    await desktopSession.firstWindow.evaluate(async ({ nodeId, storageKey: key }) => {
      await window.__folioleWorkspaceDebug?.seedNodes?.([{
        content: `![Misleading extension](asset://${key})`,
        id: nodeId,
        kind: 'topic',
        title: 'Canonical image write'
      }]);
    }, { nodeId: NODE_ID, storageKey });
    const imported = await desktopSession.firstWindow.evaluate(async ({ nodeId, sourcePath: source }) =>
      window.electronAPI?.invoke('import_local_image_attachment', { nodeId, sourcePath: source }),
    { nodeId: NODE_ID, sourcePath });
    expect(imported).toMatchObject({ status: 'imported', storage_key: storageKey });
    const nodeId = NODE_ID;
    const firstContent = (await loadNodeDocument(desktopSession.firstWindow, nodeId))?.content ?? '';
    expect(firstContent).toContain(`asset://${storageKey}`);
    expect(firstContent).not.toContain('.jpeg)');
    expect(await inspectAttachment(desktopSession.electronApp, nodeId)).toEqual({
      attachmentId: contentHash, contentHash, linkCount: 1, mimeType: 'image/png', storageKey
    });
    await expect(fs.readFile(storagePath)).resolves.toEqual(bytes);
    await expect(fs.access(path.join(libraryHome, 'Assets', `${contentHash}.jpeg`))).rejects.toThrow();

    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    await expectWorkspaceShell(secondSession.firstWindow);
    const content = (await loadNodeDocument(secondSession.firstWindow, nodeId))?.content ?? '';
    expect(content).toBe(firstContent);
    const readback = await inspectRestartReadability(secondSession.electronApp, {
      contentHash, storageKey, storagePath
    });
    expect(readback).toMatchObject({ imageEmpty: false, resolution: { status: 'ready' } });
    expect(readback.decodedSize.width).toBeGreaterThan(0);
    await writeEvidence({
      attachment: await inspectAttachment(secondSession.electronApp, nodeId),
      content, readback, sourcePath, storagePath, testInfo
    });
  } finally {
    await secondSession?.close();
  }
});
