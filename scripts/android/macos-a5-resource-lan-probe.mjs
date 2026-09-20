import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';

const IMAGES = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/bo8wWQAAAABJRU5ErkJggg=='
];
export const RESOURCE_LAN_FIRST_HASH = createHash('sha256')
  .update(Buffer.from(IMAGES[0], 'base64')).digest('hex');
const APP_ID = 'com.foliole.android.acceptance';

export function assertOwnedResourcePath(libraryHome, assetsDir, storageKey) {
  const library = fs.realpathSync(libraryHome);
  const assets = fs.realpathSync(assetsDir);
  if (!assets.startsWith(`${library}${path.sep}`) || !/^[a-f0-9]{64}\.png$/u.test(storageKey)) {
    throw new Error('Resource failure injection must stay inside the isolated acceptance library.');
  }
  return path.join(assets, storageKey);
}

export async function seedA5ResourceLanProbe(session, libraryHome) {
  const now = new Date().toISOString();
  const nodeId = `resource-lan-${Date.now()}`;
  const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const images = IMAGES.map((bytes) => {
    const hash = createHash('sha256').update(Buffer.from(bytes, 'base64')).digest('hex');
    return { hash, storageKey: `${hash}.png` };
  });
  const content = `Resource LAN body remains readable.\n\n${images.map((image, i) => `![LAN ${i}](asset://${image.storageKey})`).join('\n\n')}`;
  const payload = { activeNodeId: nodeId, anchorLink: null, content,
    createdAt: now, isTitleManual: true, kind: 'topic', nodeId,
    nodeOrder: [...snapshot.nodeOrder, nodeId], parentNodeId: 'special-inbox',
    position: snapshot.nodeOrder.length, reveal: null, title: 'Resource LAN', updatedAt: now };
  await session.invoke('create_topic', payload);
  for (const bytesBase64 of IMAGES) {
    const result = await session.invoke('import_clipboard_image_attachment', {
      bytesBase64, mimeType: 'image/png', nodeId, originalName: 'resource-lan.png'
    });
    if (result?.status !== 'imported') throw new Error('Resource LAN image import failed.');
    const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
    if (result.attachment_id !== hash) throw new Error('Resource LAN fixture bytes changed on import.');
  }
  const paths = await session.invoke('load_library_path_settings');
  const missingPath = assertOwnedResourcePath(libraryHome, paths.assets_dir, images[1].storageKey);
  const savedBytes = fs.readFileSync(missingPath);
  fs.unlinkSync(missingPath);
  return { images, nodeId, restore: () => fs.writeFileSync(missingPath, savedBytes), missingPath };
}

export async function verifyA5ResourceLanProbe({ args, buildIdentity, env, evidenceRoot, fixture, groupId }) {
  const observations = [];
  try {
    for (const phase of ['missing', 'restored', 'restarted']) {
      if (phase === 'restored') fixture.restore();
      const result = await runMacosA5InstrumentationMechanics({ appId: APP_ID, buildIdentity, env,
        evidenceRoot: path.join(evidenceRoot, `resource-${phase}`), execute: args.execute,
        installMain: false, needsTransport: false, instrumentationOwnsActivity: true,
        instrumentationArgs: ['-e', 'resourcePhase', phase, '-e', 'resourceNodeId', fixture.nodeId,
          '-e', 'resourceGroupId', groupId, '-e', 'availableHash', fixture.images[0].hash,
          '-e', 'recoveringHash', fixture.images[1].hash], paths: args.paths, serial: args.serial,
        testClass: 'com.foliole.android.FolioleResourceLanTest',
        validateInstrumentation: ({ stdout }) => {
          if (!/folioleResourceLanReceipt=.*"passed":true/u.test(stdout)) {
            throw new Error(`Physical LAN resource ${phase} was not verified.`);
          }
        }
      });
      const screenshot = path.join(evidenceRoot, `resource-${phase}.png`);
      args.checked(args.paths.adb, ['-s', args.serial, 'pull',
        `/sdcard/Android/data/${APP_ID}/files/resource-${phase}.png`, screenshot]);
      observations.push({ phase, evidencePath: result.evidencePath, screenshot });
    }
  } finally { fixture.restore(); }
  fs.writeFileSync(path.join(evidenceRoot, 'resource-lan.json'), `${JSON.stringify({
    nodeId: fixture.nodeId, images: fixture.images, observations,
    physicalDevices: ['macos', 'fixed-a5-87a33a4b'], transport: 'product-discovered LAN; no ADB reverse',
    failure: 'Mac isolated attachment bytes temporarily absent, then restored', resultStatus: 'success'
  }, null, 2)}\n`);
}

export async function verifyA5ResourceLanPresence({ args, buildIdentity, env, evidenceRoot, fixture, groupId }) {
  const phase = 'missing';
  const result = await runMacosA5InstrumentationMechanics({ appId: APP_ID, buildIdentity, env,
    evidenceRoot, execute: args.execute, installMain: false, needsTransport: false,
    instrumentationOwnsActivity: true,
    instrumentationArgs: ['-e', 'resourcePhase', phase, '-e', 'resourceNodeId', fixture.nodeId,
      '-e', 'resourceGroupId', groupId, '-e', 'availableHash', fixture.images[0].hash,
      '-e', 'recoveringHash', fixture.images[1].hash], paths: args.paths, serial: args.serial,
    testClass: 'com.foliole.android.FolioleResourceLanTest',
    validateInstrumentation: ({ stdout }) => {
      if (!/folioleResourceLanReceipt=.*"passed":true/u.test(stdout)) {
        throw new Error('A5 did not retain the independently cached attachment.');
      }
    }
  });
  return { evidencePath: result.evidencePath, hash: fixture.images[0].hash };
}
