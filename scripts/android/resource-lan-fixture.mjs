import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const IMAGES = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
];
export const RESOURCE_LAN_FIRST_HASH = createHash('sha256')
  .update(Buffer.from(IMAGES[0], 'base64')).digest('hex');

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
  const created = await session.invoke('create_topic', payload);
  const baseVersionId = created.nodes.find(node => node.nodeId === nodeId).currentVersionId;
  const newImageReferences = [];
  for (const bytesBase64 of IMAGES) {
    const result = await session.invoke('import_clipboard_image_attachment', {
      bytesBase64, mimeType: 'image/png', nodeId, originalName: 'resource-lan.png'
    });
    if (result?.status !== 'imported') {
      throw new Error(`Resource LAN image import failed: ${JSON.stringify(result)}`);
    }
    newImageReferences.push({ storage_key: result.storage_key, original_name: result.original_name, role: 'image' });
    const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
    if (result.attachment_id !== hash) throw new Error('Resource LAN fixture bytes changed on import.');
  }
  await session.invoke('update_node_content_with_anchors', { parent: payload, affectedAnchors: [],
    edit: { baseVersionId, versionId: randomUUID(), newImageReferences } });
  const paths = await session.invoke('load_library_path_settings');
  const missingPath = assertOwnedResourcePath(libraryHome, paths.assets_dir, images[1].storageKey);
  const savedBytes = fs.readFileSync(missingPath);
  fs.unlinkSync(missingPath);
  return { images, nodeId, restore: () => fs.writeFileSync(missingPath, savedBytes), missingPath };
}
