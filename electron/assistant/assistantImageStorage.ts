import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  NativeAssistantImageAttachment,
  NativeAssistantImageContentResult
} from '../../lib/platform/nativeAssistantImageContract.js';
import { getAssistantImageAttachment } from '../database/assistantThreadImages.js';
import { resolveAppPaths } from '../ipc/paths.js';

import type { ValidatedAssistantImage } from './assistantImageValidation.js';
import { resolveFolioleAideRuntimePaths } from './folioleAideRuntime.js';

export interface StoredAssistantImage extends NativeAssistantImageAttachment {
  createdFile: boolean;
  filePath: string;
}

export async function persistAssistantImages(images: ValidatedAssistantImage[]) {
  const stored: StoredAssistantImage[] = [];
  try {
    for (const image of images) stored.push(await persistAssistantImage(image));
    return stored;
  } catch (error) {
    await cleanupCreatedAssistantImages(stored);
    throw error;
  }
}

export async function cleanupCreatedAssistantImages(images: StoredAssistantImage[]) {
  await Promise.all(images.filter((image) => image.createdFile).map((image) =>
    fs.rm(image.filePath, { force: true })
  ));
}

export async function deleteAssistantImageFiles(images: NativeAssistantImageAttachment[]) {
  await Promise.all(images.map((image) => fs.rm(resolveAssistantImagePath(image), { force: true })));
}

export async function readAssistantImageContent(attachmentId: string): Promise<NativeAssistantImageContentResult> {
  const normalizedId = normalizeAttachmentId(attachmentId);
  const image = getAssistantImageAttachment(normalizedId);
  if (!image) return { attachmentId: normalizedId, status: 'not_found' };
  const filePath = resolveAssistantImagePath(image);
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { attachmentId: normalizedId, status: 'missing_file' };
    throw error;
  }
  if (bytes.byteLength !== image.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== image.id)
    return { attachmentId: normalizedId, status: 'missing_file' };
  return {
    attachmentId: normalizedId,
    contentBase64: bytes.toString('base64'),
    mimeType: image.mimeType,
    status: 'ready'
  };
}

export function resolveAssistantImagePath(image: NativeAssistantImageAttachment) {
  const extension = image.mimeType === 'image/jpeg' ? '.jpg' : image.mimeType === 'image/png' ? '.png' : '.webp';
  const root = resolveAssistantAttachmentsRoot();
  const filePath = path.resolve(root, `${normalizeAttachmentId(image.id)}${extension}`);
  if (path.dirname(filePath) !== path.resolve(root)) throw new Error('assistant_image_path_escape');
  return filePath;
}

async function persistAssistantImage(image: ValidatedAssistantImage): Promise<StoredAssistantImage> {
  const filePath = resolveAssistantImagePath(image);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, image.bytes, { flag: 'wx' });
    return { ...toAttachment(image), createdFile: true, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await fs.readFile(filePath);
    if (createHash('sha256').update(existing).digest('hex') !== image.id) throw new Error('assistant_image_hash_mismatch');
    return { ...toAttachment(image), createdFile: false, filePath };
  }
}

function resolveAssistantAttachmentsRoot() {
  const appDataPath = resolveAppPaths().app_data_dir;
  return resolveFolioleAideRuntimePaths(appDataPath, appDataPath).attachmentsRoot;
}

function normalizeAttachmentId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new Error('invalid_assistant_attachment_id');
  return normalized;
}

function toAttachment(image: ValidatedAssistantImage): NativeAssistantImageAttachment {
  return {
    id: image.id,
    mimeType: image.mimeType,
    originalName: image.originalName,
    sizeBytes: image.sizeBytes
  };
}
